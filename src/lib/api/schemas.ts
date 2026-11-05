/**
 * schemas.ts — валидация тел API.
 */

import { z } from "zod";

export const ratingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const cardRowSchema = z.object({
  id: z.string().min(1).max(128),
  wordId: z.number().int().positive(),
  meaningId: z.string().max(64),
  direction: z.literal("en-ru"),
  due: z.string().min(1),
  stability: z.number().min(0),
  difficulty: z.number().min(0),
  scheduledDays: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  learningSteps: z.number().int().min(0),
  state: z.number().int().min(0).max(3),
  lastReview: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  rev: z.number().int().min(1),
});

export const reviewRowSchema = z.object({
  id: z.string().min(1).max(128),
  cardId: z.string().min(1).max(128),
  rating: ratingSchema,
  usedHint: z.boolean(),
  createdAt: z.string().min(1),
});

export const settingsSchema = z.object({
  dailyGoal: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  hintsEnabled: z.boolean(),
  reducedMotion: z.boolean(),
  ttsRate: z.number().min(0.5).max(2),
});

const isoDateSchema = z.string().datetime({ offset: true });

export const userMnemonicSyncSchema = z
  .object({
    id: z.string().min(1).max(128),
    wordId: z.number().int().positive(),
    meaningId: z.string().min(1).max(32),
    cueWord: z.string().min(1).max(80),
    sceneText: z.string().min(5).max(500),
    locale: z.literal("ru"),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    deletedAt: isoDateSchema.nullable(),
    rev: z.number().int().min(1),
  })
  .strict();

export const mobileSelectionSchema = z
  .object({
    wordId: z.number().int().positive(),
    mnemonicId: z.string().min(1).max(128),
    updatedAt: isoDateSchema,
  })
  .strict();

export const mobileSettingsSchema = settingsSchema
  .extend({
    updatedAt: isoDateSchema,
  })
  .strict();

export const mobileReviewRowSchema = reviewRowSchema
  .extend({
    exerciseType: z.string().min(1).max(64).optional(),
    answer: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const syncBodySchema = z.object({
  cards: z.array(cardRowSchema).max(5000),
  selections: z.record(z.string(), z.string().max(128)),
  selectionUpdatedAt: z
    .record(z.string(), isoDateSchema)
    .optional()
    .default({}),
  settings: settingsSchema,
  settingsUpdatedAt: isoDateSchema.optional(),
  reviews: z.array(reviewRowSchema).max(10000),
  userMnemonics: z.array(userMnemonicSyncSchema).max(5000).optional().default([]),
});

export const mobileSyncBodySchema = z
  .object({
    cards: z.array(cardRowSchema).max(5000),
    reviews: z.array(mobileReviewRowSchema).max(10000),
    selections: z.array(mobileSelectionSchema).max(5000),
    settings: mobileSettingsSchema,
    userMnemonics: z.array(userMnemonicSyncSchema).max(5000),
  })
  .strict();

export type SyncBody = z.infer<typeof syncBodySchema>;
export type MobileSyncBody = z.infer<typeof mobileSyncBodySchema>;
export type UserMnemonicSyncBody = z.infer<typeof userMnemonicSyncSchema>;
