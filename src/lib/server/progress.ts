/**
 * progress.ts — общий сервис прогресса для веб- и мобильного API.
 *
 * Здесь живут преобразования между API-строками и таблицами PostgreSQL,
 * чистые правила last-write-wins и загрузка/применение снимка прогресса.
 */

import { eq, sql } from "drizzle-orm";

import type { UserMnemonic } from "@/features/user-mnemonics/types";
import { db } from "@/lib/db";
import {
  cards as cardsTable,
  reviews as reviewsTable,
  selections as selectionsTable,
  settings as settingsTable,
  userMnemonics as userMnemonicsTable,
} from "@/lib/db/schema";
import type { CardRow, RatingValue, Settings } from "@/lib/types";
import { defaultSettings } from "@/lib/types";

type CardSelect = typeof cardsTable.$inferSelect;
type CardInsert = typeof cardsTable.$inferInsert;
type SelectionSelect = typeof selectionsTable.$inferSelect;
type SettingsSelect = typeof settingsTable.$inferSelect;
type ReviewSelect = typeof reviewsTable.$inferSelect;
type UserMnemonicSelect = typeof userMnemonicsTable.$inferSelect;
type UserMnemonicInsert = typeof userMnemonicsTable.$inferInsert;

export type MobileSelection = {
  wordId: number;
  mnemonicId: string;
  updatedAt: string;
};

export type MobileSettings = {
  dailyGoal: Settings["dailyGoal"];
  hintsEnabled: boolean;
  reducedMotion: boolean;
  ttsRate: number;
  updatedAt: string;
};

export type MobileReview = {
  id: string;
  cardId: string;
  rating: RatingValue;
  usedHint: boolean;
  exerciseType: string;
  answer: string | null;
  createdAt: string;
};

export type MobileSyncState = {
  cards: CardRow[];
  reviews: MobileReview[];
  selections: MobileSelection[];
  settings: MobileSettings;
  userMnemonics: UserMnemonic[];
};

export type WebProgress = {
  cards: CardRow[];
  selections: Record<string, string>;
  settings: Settings;
  userMnemonics: UserMnemonic[];
};

export type ReviewInput = {
  id: string;
  cardId: string;
  rating: RatingValue;
  usedHint: boolean;
  exerciseType?: string;
  answer?: string | null;
  createdAt: string;
};

export type SettingsInput = {
  dailyGoal: Settings["dailyGoal"];
  hintsEnabled: boolean;
  reducedMotion: boolean;
  ttsRate: number;
  updatedAt?: string;
};

export type ProgressInput = {
  cards?: CardRow[];
  reviews?: ReviewInput[];
  selections?: Record<string, string> | MobileSelection[];
  settings?: SettingsInput;
  userMnemonics?: UserMnemonic[];
};

const EPOCH = new Date(0).toISOString();

function timestampMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** true, когда входящая ревизия строго новее сохранённой. */
export function isNewerRevision(incomingRev: number, storedRev: number): boolean {
  return Number.isInteger(incomingRev) && incomingRev > storedRev;
}

/** true, когда входящая метка времени строго новее сохранённой. */
export function isNewerTimestamp(incoming: string | Date, stored: string | Date): boolean {
  const incomingMs = timestampMs(incoming);
  const storedMs = timestampMs(stored);
  return Number.isFinite(incomingMs) && Number.isFinite(storedMs) && incomingMs > storedMs;
}

/** Оставляет запись с более поздним updatedAt при равной ревизии. */
export function isNewerRevisionRecord<
  T extends { rev: number; updatedAt: string },
>(incoming: T, stored: T): boolean {
  if (isNewerRevision(incoming.rev, stored.rev)) return true;
  if (!Number.isInteger(incoming.rev) || incoming.rev !== stored.rev) {
    return false;
  }
  return isNewerTimestamp(incoming.updatedAt, stored.updatedAt);
}

/** Ревизия, затем updatedAt; при полном равенстве побеждает сохранённая. */
export function mergeByRevision<T extends { rev: number; updatedAt: string }>(
  stored: T,
  incoming: T,
): T {
  return isNewerRevisionRecord(incoming, stored) ? incoming : stored;
}

/** Оставляет запись с более новым updatedAt; при равенстве побеждает сохранённая. */
export function mergeByTimestamp<T extends { updatedAt: string }>(stored: T, incoming: T): T {
  return isNewerTimestamp(incoming.updatedAt, stored.updatedAt) ? incoming : stored;
}

/**
 * Сливает личные ассоциации по rev. Tombstone — обычная запись с deletedAt,
 * поэтому при большей ревизии он побеждает активную и наоборот.
 */
export function mergeUserMnemonic(stored: UserMnemonic, incoming: UserMnemonic): UserMnemonic {
  if (isNewerRevision(incoming.rev, stored.rev)) return incoming;
  if (incoming.rev !== stored.rev) return stored;

  if (isNewerTimestamp(incoming.updatedAt, stored.updatedAt)) return incoming;

  const incomingMs = timestampMs(incoming.updatedAt);
  const storedMs = timestampMs(stored.updatedAt);

  if (!Number.isFinite(incomingMs) || !Number.isFinite(storedMs)) {
    return stored;
  }

  if (incomingMs !== storedMs) return stored;

  return incoming.deletedAt !== null && stored.deletedAt === null
    ? incoming
    : stored;
}

export function toCardRow(row: CardSelect): CardRow {
  return {
    id: row.id,
    wordId: row.wordId,
    meaningId: row.meaningId,
    direction: "en-ru",
    due: row.due.toISOString(),
    stability: row.stability,
    difficulty: row.difficulty,
    scheduledDays: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    learningSteps: row.learningSteps,
    state: row.state,
    lastReview: row.lastReview ? row.lastReview.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    rev: row.rev,
  };
}

export function toCardInsert(userId: string, row: CardRow): CardInsert {
  return {
    id: toServerId(userId, row.id),
    userId,
    wordId: row.wordId,
    meaningId: row.meaningId,
    direction: row.direction,
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    scheduledDays: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    learningSteps: row.learningSteps,
    state: row.state,
    lastReview: row.lastReview ? new Date(row.lastReview) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    rev: row.rev,
  };
}

export function toSettings(
  row: Pick<SettingsSelect, "dailyGoal" | "hintsEnabled" | "reducedMotion" | "ttsRate"> | undefined,
): Settings {
  if (!row) return { ...defaultSettings };
  return {
    ...defaultSettings,
    dailyGoal: [5, 10, 15, 20].includes(row.dailyGoal) ? (row.dailyGoal as Settings["dailyGoal"]) : 10,
    hintsEnabled: row.hintsEnabled,
    reducedMotion: row.reducedMotion,
    ttsRate: row.ttsRate,
    associationSwipeHintSeen: false,
  };
}

export function selectionMap(rows: Pick<SelectionSelect, "wordId" | "mnemonicId">[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [String(row.wordId), row.mnemonicId]));
}

export function toMobileSettings(row: SettingsSelect | undefined): MobileSettings {
  if (!row) {
    return {
      dailyGoal: defaultSettings.dailyGoal,
      hintsEnabled: defaultSettings.hintsEnabled,
      reducedMotion: defaultSettings.reducedMotion,
      ttsRate: defaultSettings.ttsRate,
      updatedAt: EPOCH,
    };
  }

  return {
    dailyGoal: [5, 10, 15, 20].includes(row.dailyGoal) ? (row.dailyGoal as Settings["dailyGoal"]) : 10,
    hintsEnabled: row.hintsEnabled,
    reducedMotion: row.reducedMotion,
    ttsRate: row.ttsRate,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMobileSelection(row: SelectionSelect): MobileSelection {
  return {
    wordId: row.wordId,
    mnemonicId: row.mnemonicId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMobileReview(row: ReviewSelect): MobileReview {
  return {
    id: row.id,
    cardId: row.cardId,
    rating: row.rating as RatingValue,
    usedHint: row.usedHint,
    exerciseType: row.exerciseType,
    answer: row.answer,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserMnemonic(row: UserMnemonicSelect): UserMnemonic {
  return {
    id: row.id,
    wordId: row.wordId,
    meaningId: row.meaningId,
    cueWord: row.cueWord,
    sceneText: row.sceneText,
    locale: "ru",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    rev: row.rev,
  };
}

function toServerId(userId: string, clientId: string): string {
  const prefix = `${userId}:`;
  return clientId.startsWith(prefix) ? clientId : `${prefix}${clientId}`;
}

export function toUserMnemonicInsert(userId: string, row: UserMnemonic): UserMnemonicInsert {
  return {
    id: toServerId(userId, row.id),
    userId,
    wordId: row.wordId,
    meaningId: row.meaningId,
    cueWord: row.cueWord,
    sceneText: row.sceneText,
    locale: row.locale,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
    rev: row.rev,
  };
}

export function toWebProgress(state: MobileSyncState): WebProgress {
  return {
    cards: state.cards,
    selections: selectionMap(state.selections),
    settings: toSettings(state.settings),
    userMnemonics: state.userMnemonics,
  };
}

export async function loadProgress(userId: string): Promise<MobileSyncState> {
  const [cardRows, reviewRows, selectionRows, settingsRows, mnemonicRows] = await Promise.all([
    db.select().from(cardsTable).where(eq(cardsTable.userId, userId)),
    db.select().from(reviewsTable).where(eq(reviewsTable.userId, userId)),
    db.select().from(selectionsTable).where(eq(selectionsTable.userId, userId)),
    db.select().from(settingsTable).where(eq(settingsTable.userId, userId)),
    db.select().from(userMnemonicsTable).where(eq(userMnemonicsTable.userId, userId)),
  ]);

  return {
    cards: cardRows.map(toCardRow),
    reviews: reviewRows.map(toMobileReview),
    selections: selectionRows.map(toMobileSelection),
    settings: toMobileSettings(settingsRows[0]),
    userMnemonics: mnemonicRows.map(toUserMnemonic),
  };
}

function normalizeSelections(
  input: ProgressInput["selections"],
  now: Date,
): MobileSelection[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;

  const updatedAt = now.toISOString();
  return Object.entries(input).map(([wordId, mnemonicId]) => ({
    wordId: Number(wordId),
    mnemonicId,
    updatedAt,
  }));
}

function normalizeSettings(input: ProgressInput["settings"], now: Date): MobileSettings | null {
  if (!input) return null;
  return {
    dailyGoal: input.dailyGoal,
    hintsEnabled: input.hintsEnabled,
    reducedMotion: input.reducedMotion,
    ttsRate: input.ttsRate,
    updatedAt: input.updatedAt ?? now.toISOString(),
  };
}

export async function applyProgress(userId: string, input: ProgressInput): Promise<void> {
  const now = new Date();
  const cards = input.cards ?? [];
  const reviews = input.reviews ?? [];
  const selections = normalizeSelections(input.selections, now);
  const settings = normalizeSettings(input.settings, now);
  const userMnemonics = input.userMnemonics ?? [];

  await db.transaction(async (tx) => {
    for (const row of cards) {
      const values = toCardInsert(userId, row);
      await tx
        .insert(cardsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [cardsTable.userId, cardsTable.wordId],
          set: {
            due: values.due,
            stability: values.stability,
            difficulty: values.difficulty,
            scheduledDays: values.scheduledDays,
            reps: values.reps,
            lapses: values.lapses,
            learningSteps: values.learningSteps,
            state: values.state,
            lastReview: values.lastReview,
            updatedAt: values.updatedAt,
            rev: values.rev,
          },
          setWhere: sql`${cardsTable.rev} < excluded.rev or (${cardsTable.rev} = excluded.rev and ${cardsTable.updatedAt} < excluded.updated_at)`,
        });
    }

    for (const row of selections) {
      const updatedAt = new Date(row.updatedAt);
      await tx
        .insert(selectionsTable)
        .values({
          id: `${userId}:${row.wordId}`,
          userId,
          wordId: row.wordId,
          mnemonicId: row.mnemonicId,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [selectionsTable.userId, selectionsTable.wordId],
          set: { mnemonicId: row.mnemonicId, updatedAt },
          setWhere: sql`${selectionsTable.updatedAt} < excluded.updated_at`,
        });
    }

    if (settings) {
      const updatedAt = new Date(settings.updatedAt);
      await tx
        .insert(settingsTable)
        .values({
          userId,
          dailyGoal: settings.dailyGoal,
          hintsEnabled: settings.hintsEnabled,
          reducedMotion: settings.reducedMotion,
          ttsRate: settings.ttsRate,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: settingsTable.userId,
          set: {
            dailyGoal: settings.dailyGoal,
            hintsEnabled: settings.hintsEnabled,
            reducedMotion: settings.reducedMotion,
            ttsRate: settings.ttsRate,
            updatedAt,
          },
          setWhere: sql`${settingsTable.updatedAt} < excluded.updated_at`,
        });
    }

    for (const review of reviews) {
      await tx
        .insert(reviewsTable)
        .values({
          id: toServerId(userId, review.id),
          userId,
          cardId: toServerId(userId, review.cardId),
          rating: review.rating,
          usedHint: review.usedHint,
          exerciseType: review.exerciseType ?? "review",
          answer: review.answer ?? null,
          createdAt: new Date(review.createdAt),
        })
        .onConflictDoNothing();
    }

    for (const row of userMnemonics) {
      const values = toUserMnemonicInsert(userId, row);
      await tx
        .insert(userMnemonicsTable)
        .values(values)
        .onConflictDoUpdate({
          target: userMnemonicsTable.id,
          set: {
            wordId: values.wordId,
            meaningId: values.meaningId,
            cueWord: values.cueWord,
            sceneText: values.sceneText,
            locale: values.locale,
            updatedAt: values.updatedAt,
            deletedAt: values.deletedAt,
            rev: values.rev,
          },
          setWhere: sql`${userMnemonicsTable.rev} < excluded.rev or (${userMnemonicsTable.rev} = excluded.rev and ${userMnemonicsTable.updatedAt} < excluded.updated_at) or (${userMnemonicsTable.rev} = excluded.rev and ${userMnemonicsTable.updatedAt} = excluded.updated_at and ${userMnemonicsTable.deletedAt} is null and excluded.deleted_at is not null)`,
        });
    }
  });
}
