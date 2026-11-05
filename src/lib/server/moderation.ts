/**
 * moderation.ts — общая логика очереди модерации текстовых вкладов.
 *
 * Модератор видит только текстовые поля вклада и псевдонимный идентификатор
 * автора. Email и сырой userId никогда не попадают в ответ. Решение
 * фиксируется в mnemonic_contributions и audit_log; публикация контента —
 * отдельный ручной процесс и здесь не выполняется.
 */

import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";

import { getWord } from "@/content";
import { db } from "@/lib/db";
import {
  auditLog as auditLogTable,
  mnemonicContributions as mnemonicContributionsTable,
} from "@/lib/db/schema";
import type { SensitiveContentFlags } from "@/lib/server/contribution-filter";

export const MODERATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "duplicate",
  "withdrawn",
] as const;

export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const MODERATION_ACTIONS = [
  "approve",
  "reject",
  "duplicate",
  "needs_edit",
  "withdraw",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export type ModerationQueueItem = {
  id: string;
  wordId: number;
  meaningId: string;
  word: string | null;
  translation: string | null;
  pronunciation: string | null;
  ipa: string | null;
  cueWord: string;
  sceneText: string;
  locale: string;
  consentVersion: string;
  submittedAt: string;
  status: ModerationStatus;
  moderationReason: string | null;
  flags: SensitiveContentFlags;
  contributorId: string | null;
  duplicateCount: number;
  duplicateScore: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type ModerationDecision = {
  id: string;
  action: ModerationAction;
  reason?: string;
  reviewerId: string;
};

export type ModerationDecisionResult = {
  id: string;
  status: ModerationStatus;
  moderationReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  idempotent: boolean;
};

const ACTION_STATUS: Record<ModerationAction, ModerationStatus> = {
  approve: "approved",
  reject: "rejected",
  duplicate: "duplicate",
  needs_edit: "pending",
  withdraw: "withdrawn",
};

/** Проверяет, что строка из query/БД является известным статусом. */
export function isModerationStatus(value: string): value is ModerationStatus {
  return (MODERATION_STATUSES as readonly string[]).includes(value);
}

function pseudonymSecret(): string {
  return (
    process.env.MODERATION_PSEUDONYM_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    "development-moderation-pseudonym-secret"
  );
}

/**
 * Стабильный псевдоним автора: HMAC-SHA256 от userId с серверным секретом.
 * Одинаковый автор получает одинаковый id, но восстановить userId нельзя.
 */
export function pseudonymousContributorId(
  contributorUserId: string | null | undefined,
): string | null {
  if (!contributorUserId) return null;
  const digest = createHmac("sha256", pseudonymSecret())
    .update(contributorUserId)
    .digest("hex");
  return `contributor_${digest}`;
}

/** Разбирает сохранённый moderationReason в флаги чувствительного контента. */
export function parseModerationFlags(
  moderationReason: string | null,
): SensitiveContentFlags {
  const flags: SensitiveContentFlags = {
    email: false,
    phone: false,
    url: false,
  };
  if (!moderationReason) return flags;

  const match = /^sensitive_content:(.*)$/.exec(moderationReason);
  if (!match) return flags;

  for (const flag of match[1].split(",").map((value) => value.trim())) {
    if (flag === "email" || flag === "phone" || flag === "url") {
      flags[flag] = true;
    }
  }
  return flags;
}

/**
 * Оценка дубликата для точного совпадения wordId + normalizedHash:
 * 0 — уникальный текст, 1 — есть хотя бы один такой же вклад.
 */
export function duplicateScore(duplicateCount: number): number {
  return duplicateCount > 0 ? 1 : 0;
}

/** Преобразует строку БД в элемент очереди без email и сырого userId. */
export function toModerationQueueItem(
  row: typeof mnemonicContributionsTable.$inferSelect,
  duplicateCount = 0,
): ModerationQueueItem {
  const word = getWord(row.wordId);
  return {
    id: row.id,
    wordId: row.wordId,
    meaningId: row.meaningId,
    word: word?.lemma ?? null,
    translation: word?.meanings.join("; ") ?? null,
    pronunciation: word?.ruPronunciation ?? null,
    ipa: word?.ipa ?? null,
    cueWord: row.cueWord,
    sceneText: row.sceneText,
    locale: row.locale,
    consentVersion: row.consentVersion,
    submittedAt: row.submittedAt.toISOString(),
    status: isModerationStatus(row.status) ? row.status : "pending",
    moderationReason: row.moderationReason,
    flags: parseModerationFlags(row.moderationReason),
    contributorId: pseudonymousContributorId(row.contributorUserId),
    duplicateCount,
    duplicateScore: duplicateScore(duplicateCount),
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Возвращает очередь по статусу (по умолчанию pending) с числом дубликатов
 * по той же паре wordId + normalizedHash. Свежие вклады идут первыми.
 */
export async function listModerationQueue(
  status: ModerationStatus = "pending",
): Promise<ModerationQueueItem[]> {
  const rows = await db
    .select()
    .from(mnemonicContributionsTable)
    .where(eq(mnemonicContributionsTable.status, status));
  const allRows = await db.select().from(mnemonicContributionsTable);

  const groupCounts = new Map<string, number>();
  for (const row of allRows) {
    const key = `${row.wordId}\u0000${row.normalizedHash}`;
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }

  return rows
    .slice()
    .sort(
      (left, right) =>
        right.submittedAt.getTime() - left.submittedAt.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime(),
    )
    .map((row) => {
      const key = `${row.wordId}\u0000${row.normalizedHash}`;
      const total = groupCounts.get(key) ?? 1;
      return toModerationQueueItem(row, total - 1);
    });
}

/**
 * Применяет решение модератора и всегда пишет audit_log.
 *
 * Повторный withdraw идемпотентен по состоянию: запись не меняется второй
 * раз, но факт повторного решения остаётся в аудите. null — вклад не найден.
 */
export async function applyModerationDecision(
  decision: ModerationDecision,
): Promise<ModerationDecisionResult | null> {
  const reason = decision.reason?.trim() ? decision.reason.trim() : null;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mnemonicContributionsTable)
      .where(eq(mnemonicContributionsTable.id, decision.id));
    if (!existing) return null;

    const now = new Date();
    const idempotent =
      decision.action === "withdraw" && existing.status === "withdrawn";
    let row = existing;

    if (!idempotent) {
      const [updated] = await tx
        .update(mnemonicContributionsTable)
        .set({
          status: ACTION_STATUS[decision.action],
          moderationReason: reason,
          reviewedBy: decision.reviewerId,
          reviewedAt: now,
        })
        .where(eq(mnemonicContributionsTable.id, decision.id))
        .returning();
      if (!updated) return null;
      row = updated;
    }

    await tx.insert(auditLogTable).values({
      id: crypto.randomUUID(),
      actorId: decision.reviewerId,
      action: `mnemonic_contribution.${decision.action}`,
      targetType: "mnemonic_contribution",
      targetId: existing.id,
      meta: {
        action: decision.action,
        previousStatus: existing.status,
        status: row.status,
        reason,
        idempotent,
      },
      createdAt: now,
    });

    return {
      id: row.id,
      status: isModerationStatus(row.status) ? row.status : "pending",
      moderationReason: row.moderationReason,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      idempotent,
    };
  });
}
