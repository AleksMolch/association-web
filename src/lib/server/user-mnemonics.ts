/**
 * user-mnemonics.ts — CRUD личных текстовых ассоциаций.
 *
 * Каждое чтение и изменение ограничено владельцем сессии. Идентификатор
 * записи — серверный, с префиксом пользователя.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import type { UserMnemonic } from "@/features/user-mnemonics/types";
import { db } from "@/lib/db";
import { userMnemonics as userMnemonicsTable } from "@/lib/db/schema";
import { toUserMnemonic } from "@/lib/server/progress";

type UserMnemonicRow = typeof userMnemonicsTable.$inferSelect;

export type CreateUserMnemonicInput = {
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
};

export type UpdateUserMnemonicInput = {
  cueWord?: string;
  sceneText?: string;
};

/** Возвращает активные ассоциации владельца, опционально по слову. */
export async function listUserMnemonics(
  userId: string,
  wordId?: number,
): Promise<UserMnemonic[]> {
  const filters = [eq(userMnemonicsTable.userId, userId), isNull(userMnemonicsTable.deletedAt)];
  if (wordId !== undefined) filters.push(eq(userMnemonicsTable.wordId, wordId));

  const rows = await db
    .select()
    .from(userMnemonicsTable)
    .where(and(...filters));

  return rows.map(toUserMnemonic);
}

/** Создаёт новую ассоциацию с серверным id и первой ревизией. */
export async function createUserMnemonic(
  userId: string,
  input: CreateUserMnemonicInput,
): Promise<UserMnemonic> {
  const now = new Date();
  const values = {
    id: `${userId}:${crypto.randomUUID()}`,
    userId,
    wordId: input.wordId,
    meaningId: input.meaningId,
    cueWord: input.cueWord,
    sceneText: input.sceneText,
    locale: "ru",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rev: 1,
  } satisfies UserMnemonicRow;

  await db.insert(userMnemonicsTable).values(values);
  return toUserMnemonic(values);
}

/** Обновляет активную ассоциацию владельца; null — чужая, удалённая или отсутствующая. */
export async function updateUserMnemonic(
  userId: string,
  id: string,
  input: UpdateUserMnemonicInput,
): Promise<UserMnemonic | null> {
  const changes = {
    ...(input.cueWord !== undefined ? { cueWord: input.cueWord } : {}),
    ...(input.sceneText !== undefined ? { sceneText: input.sceneText } : {}),
    updatedAt: new Date(),
    rev: sql`${userMnemonicsTable.rev} + 1`,
  };

  const [row] = await db
    .update(userMnemonicsTable)
    .set(changes)
    .where(
      and(
        eq(userMnemonicsTable.id, id),
        eq(userMnemonicsTable.userId, userId),
        isNull(userMnemonicsTable.deletedAt),
      ),
    )
    .returning();

  return row ? toUserMnemonic(row) : null;
}

/**
 * Ставит tombstone на активную ассоциацию владельца.
 *
 * Повторное удаление идемпотентно: существующий tombstone возвращается без
 * новой ревизии. Для чужого или отсутствующего id возвращается null.
 */
export async function deleteUserMnemonic(
  userId: string,
  id: string,
): Promise<UserMnemonic | null> {
  const now = new Date();
  const [row] = await db
    .update(userMnemonicsTable)
    .set({
      deletedAt: now,
      updatedAt: now,
      rev: sql`${userMnemonicsTable.rev} + 1`,
    })
    .where(
      and(
        eq(userMnemonicsTable.id, id),
        eq(userMnemonicsTable.userId, userId),
        isNull(userMnemonicsTable.deletedAt),
      ),
    )
    .returning();

  if (row) return toUserMnemonic(row);

  const [existing] = await db
    .select()
    .from(userMnemonicsTable)
    .where(and(eq(userMnemonicsTable.id, id), eq(userMnemonicsTable.userId, userId)));

  return existing?.deletedAt ? toUserMnemonic(existing) : null;
}
