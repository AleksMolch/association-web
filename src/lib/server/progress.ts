/**
 * progress.ts — преобразование между API-строками и таблицами PostgreSQL.
 */

import type { CardRow, Settings } from "@/lib/types";
import { defaultSettings } from "@/lib/types";
import type { cards, selections, settings } from "@/lib/db/schema";

type CardSelect = typeof cards.$inferSelect;
type CardInsert = typeof cards.$inferInsert;
type SelectionSelect = typeof selections.$inferSelect;
type SettingsSelect = typeof settings.$inferSelect;

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
    id: `${userId}:${row.id}`,
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

export function toSettings(row: SettingsSelect | undefined): Settings {
  if (!row) return { ...defaultSettings };
  return {
    dailyGoal: [5, 10, 15, 20].includes(row.dailyGoal) ? (row.dailyGoal as Settings["dailyGoal"]) : 10,
    hintsEnabled: row.hintsEnabled,
    reducedMotion: row.reducedMotion,
    ttsRate: row.ttsRate,
    associationSwipeHintSeen: false,
  };
}

export function selectionMap(rows: SelectionSelect[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [String(row.wordId), row.mnemonicId]));
}
