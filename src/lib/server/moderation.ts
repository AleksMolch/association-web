/**
 * moderation.ts — общая логика очереди модерации текстовых вкладов.
 *
 * Модератор видит только текстовые поля вклада и псевдонимный идентификатор
 * автора. Email и сырой userId никогда не попадают в ответ. Решение
 * фиксируется в mnemonic_contributions и audit_log; публикация контента —
 * отдельный ручной процесс и здесь не выполняется.
 */

import { createHmac } from "node:crypto";
import { count, desc, eq, inArray } from "drizzle-orm";

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

export const MODERATION_QUEUE_DEFAULT_LIMIT = 50;
export const MODERATION_QUEUE_MAX_LIMIT = 200;

const SENSITIVE_PREFIX = /^sensitive_content:([a-z,]+)/;
const SENSITIVE_FLAG_NAMES = ["email", "phone", "url"] as const;

export type ModerationQueueItem = {
  id: string;
  wordId: number;
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
  reviewedAt: string | null;
  createdAt: string;
};

export type ModerationQueuePage = {
  items: ModerationQueueItem[];
  total: number;
  limit: number;
  offset: number;
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

export type ModerationDecisionOutcome =
  | { outcome: "ok"; result: ModerationDecisionResult }
  | { outcome: "not_found" }
  | { outcome: "withdrawn" };

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

type SensitiveFlagName = (typeof SENSITIVE_FLAG_NAMES)[number];

function sensitiveFlagList(
  moderationReason: string | null,
): SensitiveFlagName[] {
  const match = SENSITIVE_PREFIX.exec(moderationReason ?? "");
  if (!match) return [];

  return match[1]
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is SensitiveFlagName =>
      (SENSITIVE_FLAG_NAMES as readonly string[]).includes(value),
    );
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

  for (const flag of sensitiveFlagList(moderationReason)) {
    flags[flag] = true;
  }
  return flags;
}

/**
 * Объединяет старый sensitive_content-префикс с новым текстом решения.
 * Флаги сохраняются для needs_edit и последующих решений, даже если человек
 * заменил текстовую причину.
 */
export function mergeModerationReason(
  previousReason: string | null,
  nextReason: string | null,
): string | null {
  const flags = new Set([
    ...sensitiveFlagList(previousReason),
    ...sensitiveFlagList(nextReason),
  ]);
  const humanReason = (nextReason ?? "")
    .replace(SENSITIVE_PREFIX, "")
    .replace(/^\s*;\s*/, "")
    .trim();

  const parts: string[] = [];
  if (flags.size > 0) parts.push(`sensitive_content:${[...flags].join(",")}`);
  if (humanReason) parts.push(humanReason);
  return parts.length > 0 ? parts.join("; ") : null;
}

/**
 * Оценка дубликата для точного совпадения wordId + normalizedHash:
 * 0 — уникальный текст, 1 — есть хотя бы один такой же вклад.
 */
export function duplicateScore(duplicateCount: number): number {
  return duplicateCount > 0 ? 1 : 0;
}

/** Ограничивает limit/offset безопасными значениями для запроса очереди. */
export function normalizeQueuePagination(
  limit: number = MODERATION_QUEUE_DEFAULT_LIMIT,
  offset = 0,
): { limit: number; offset: number } {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(
        Math.max(Math.trunc(limit), 1),
        MODERATION_QUEUE_MAX_LIMIT,
      )
    : MODERATION_QUEUE_DEFAULT_LIMIT;
  const safeOffset =
    Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0;
  return { limit: safeLimit, offset: safeOffset };
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
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Возвращает страницу очереди по статусу (по умолчанию pending).
 *
 * Total считается отдельным COUNT, строки читаются с limit/offset, а число
 * дубликатов — сгруппированным SQL-агрегатом только по wordId текущей
 * страницы. Полные строки всей таблицы в память не загружаются.
 */
export async function listModerationQueue(options: {
  status?: ModerationStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<ModerationQueuePage> {
  const status = options.status ?? "pending";
  const { limit, offset } = normalizeQueuePagination(
    options.limit,
    options.offset,
  );

  const [totalRow] = await db
    .select({ value: count() })
    .from(mnemonicContributionsTable)
    .where(eq(mnemonicContributionsTable.status, status));

  const rows = await db
    .select()
    .from(mnemonicContributionsTable)
    .where(eq(mnemonicContributionsTable.status, status))
    .orderBy(
      desc(mnemonicContributionsTable.submittedAt),
      desc(mnemonicContributionsTable.createdAt),
    )
    .limit(limit)
    .offset(offset);

  const wordIds = [...new Set(rows.map((row) => row.wordId))];
  const duplicateGroups =
    wordIds.length === 0
      ? []
      : await db
          .select({
            wordId: mnemonicContributionsTable.wordId,
            normalizedHash: mnemonicContributionsTable.normalizedHash,
            value: count(),
          })
          .from(mnemonicContributionsTable)
          .where(inArray(mnemonicContributionsTable.wordId, wordIds))
          .groupBy(
            mnemonicContributionsTable.wordId,
            mnemonicContributionsTable.normalizedHash,
          );

  const groupCounts = new Map(
    duplicateGroups.map((group) => [
      `${group.wordId}\u0000${group.normalizedHash}`,
      Number(group.value),
    ]),
  );

  return {
    items: rows.map((row) => {
      const key = `${row.wordId}\u0000${row.normalizedHash}`;
      const total = groupCounts.get(key) ?? 1;
      return toModerationQueueItem(row, total - 1);
    }),
    total: Number(totalRow?.value ?? 0),
    limit,
    offset,
  };
}

/**
 * Применяет решение модератора и всегда пишет audit_log.
 *
 * Withdrawn — терминальный статус для обычной модерации: вернуть вклад в
 * approved/rejected/duplicate/pending нельзя (409 на уровне API). Повторный
 * withdraw идемпотентен по состоянию, но остаётся в аудите. null-подобный
 * not_found — вклад не найден.
 */
export async function applyModerationDecision(
  decision: ModerationDecision,
): Promise<ModerationDecisionOutcome> {
  const reason = decision.reason?.trim() ? decision.reason.trim() : null;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mnemonicContributionsTable)
      .where(eq(mnemonicContributionsTable.id, decision.id));
    if (!existing) return { outcome: "not_found" };

    if (existing.status === "withdrawn" && decision.action !== "withdraw") {
      return { outcome: "withdrawn" };
    }

    const now = new Date();
    const idempotent =
      decision.action === "withdraw" && existing.status === "withdrawn";
    let row = existing;

    if (!idempotent) {
      const [updated] = await tx
        .update(mnemonicContributionsTable)
        .set({
          status: ACTION_STATUS[decision.action],
          moderationReason: mergeModerationReason(
            existing.moderationReason,
            reason,
          ),
          reviewedBy: decision.reviewerId,
          reviewedAt: now,
        })
        .where(eq(mnemonicContributionsTable.id, decision.id))
        .returning();
      if (!updated) return { outcome: "not_found" };
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
        previousReason: existing.moderationReason,
        previousFlags: parseModerationFlags(existing.moderationReason),
        status: row.status,
        reason,
        idempotent,
      },
      createdAt: now,
    });

    return {
      outcome: "ok" as const,
      result: {
        id: row.id,
        status: isModerationStatus(row.status) ? row.status : "pending",
        moderationReason: row.moderationReason,
        reviewedBy: row.reviewedBy,
        reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
        idempotent,
      },
    };
  });
}
