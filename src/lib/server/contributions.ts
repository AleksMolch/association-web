/**
 * contributions.ts — сервис настройки согласия на отправку вкладов.
 *
 * Чтение и запись всегда ограничены владельцем сессии. Строка настроек
 * одна на пользователя, поэтому запись выполняется через upsert.
 */

import type { z } from "zod";
import { eq } from "drizzle-orm";

import type { contributionPreferenceSchema } from "@/features/user-mnemonics/schemas";
import type { ContributionConsent } from "@/features/user-mnemonics/types";
import { db } from "@/lib/db";
import { contributionPreferences as contributionPreferencesTable } from "@/lib/db/schema";

type ContributionPreferenceRow = typeof contributionPreferencesTable.$inferSelect;

/** Входные данные PUT: статус и версия согласия. */
export type ContributionPreferenceInput = z.infer<typeof contributionPreferenceSchema>;

/** Публичное представление настройки согласия. */
export type ContributionPreference = {
  status: ContributionConsent;
  consentVersion: string | null;
  decidedAt: string | null;
  nextPromptAt: string | null;
};

const ASK_LATER_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_CONTRIBUTION_PREFERENCE: ContributionPreference = {
  status: "unset",
  consentVersion: null,
  decidedAt: null,
  nextPromptAt: null,
};

function toContributionPreference(row: ContributionPreferenceRow): ContributionPreference {
  return {
    status: row.status as ContributionConsent,
    consentVersion: row.consentVersion,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    nextPromptAt: row.nextPromptAt ? row.nextPromptAt.toISOString() : null,
  };
}

/** Возвращает настройку владельца или unset-значение по умолчанию. */
export async function getContributionPreference(
  userId: string,
): Promise<ContributionPreference> {
  const [row] = await db
    .select()
    .from(contributionPreferencesTable)
    .where(eq(contributionPreferencesTable.userId, userId));

  return row ? toContributionPreference(row) : { ...DEFAULT_CONTRIBUTION_PREFERENCE };
}

/**
 * Сохраняет решение владельца.
 *
 * `ask_later` откладывает повторный показ на 30 дней; остальные статусы
 * очищают `nextPromptAt`. `decidedAt` и `updatedAt` фиксируются текущим
 * временем на каждом решении.
 */
export async function setContributionPreference(
  userId: string,
  input: ContributionPreferenceInput,
): Promise<ContributionPreference> {
  const now = new Date();
  const nextPromptAt =
    input.status === "ask_later" ? new Date(now.getTime() + ASK_LATER_DELAY_MS) : null;

  const values = {
    userId,
    status: input.status,
    consentVersion: input.consentVersion,
    decidedAt: now,
    nextPromptAt,
    updatedAt: now,
  } satisfies ContributionPreferenceRow;

  await db
    .insert(contributionPreferencesTable)
    .values(values)
    .onConflictDoUpdate({
      target: contributionPreferencesTable.userId,
      set: {
        status: values.status,
        consentVersion: values.consentVersion,
        decidedAt: values.decidedAt,
        nextPromptAt: values.nextPromptAt,
        updatedAt: values.updatedAt,
      },
    });

  return toContributionPreference(values);
}
