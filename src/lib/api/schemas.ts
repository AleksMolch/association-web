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

export const syncBodySchema = z.object({
  cards: z.array(cardRowSchema).max(5000),
  selections: z.record(z.string(), z.string().max(128)),
  settings: settingsSchema,
  reviews: z.array(reviewRowSchema).max(10000),
});

export type SyncBody = z.infer<typeof syncBodySchema>;
