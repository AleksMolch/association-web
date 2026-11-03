/**
 * types.ts — доменные типы веб-тренажёра.
 *
 * Карточка хранит FSRS-состояние в сериализуемом виде, пригодном для
 * localStorage (guest) и PostgreSQL (зарегистрированный пользователь).
 */

export type Direction = "en-ru";

export type RatingValue = 1 | 2 | 3 | 4;

export type CardRow = {
  id: string;
  wordId: number;
  meaningId: string;
  direction: Direction;
  due: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: number;
  lastReview: string | null;
  createdAt: string;
  updatedAt: string;
  rev: number;
};

export type ReviewRow = {
  id: string;
  cardId: string;
  rating: RatingValue;
  usedHint: boolean;
  createdAt: string;
};

export type Settings = {
  dailyGoal: 5 | 10 | 15 | 20;
  hintsEnabled: boolean;
  reducedMotion: boolean;
  ttsRate: number;
  associationSwipeHintSeen: boolean;
};

export const defaultSettings: Settings = {
  dailyGoal: 10,
  hintsEnabled: true,
  reducedMotion: false,
  ttsRate: 0.95,
  associationSwipeHintSeen: false,
};

export type SessionItem = {
  kind: "new" | "review";
  wordId: number;
};

export type DayCount = { day: string; count: number };

export type AppStats = {
  totalWords: number;
  introduced: number;
  dueNow: number;
  reviewsToday: number;
  newToday: number;
  streak: number;
  stateCounts: Record<number, number>;
  lastSevenDays: DayCount[];
  leeches: CardRow[];
};
