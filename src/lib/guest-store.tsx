"use client";

/**
 * guest-store.tsx — локальный прогресс гостя в localStorage.
 *
 * До регистрации все карточки, выбранные ассоциации и настройки хранятся в
 * браузере. Состояние читается через useSyncExternalStore: сервер отдаёт
 * пустой снимок, клиент после гидратации — сохранённый.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { words } from "@/content";
import type { Word } from "@/content/types";
import { applyRating, createNewCard, isDue } from "@/lib/fsrs";
import {
  defaultSettings,
  type AppStats,
  type CardRow,
  type RatingValue,
  type ReviewRow,
  type SessionItem,
  type Settings,
} from "@/lib/types";

const STORAGE_KEY = "association_guest_v1";

type GuestState = {
  version: 1;
  cards: Record<string, CardRow>;
  selections: Record<string, string>;
  settings: Settings;
  reviews: ReviewRow[];
  updatedAt: string;
};

const EMPTY_UPDATED_AT = "1970-01-01T00:00:00.000Z";

const emptyState = (): GuestState => ({
  version: 1,
  cards: {},
  selections: {},
  settings: { ...defaultSettings },
  reviews: [],
  updatedAt: EMPTY_UPDATED_AT,
});

const emptyStats: AppStats = {
  totalWords: words.length,
  introduced: 0,
  dueNow: 0,
  reviewsToday: 0,
  newToday: 0,
  streak: 0,
  stateCounts: {},
  lastSevenDays: [],
  leeches: [],
};

const serverState = emptyState();
let clientState: GuestState | null = null;
let storageBound = false;
const listeners = new Set<() => void>();

function loadState(): GuestState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as GuestState;
    if (!parsed || parsed.version !== 1) return emptyState();
    return {
      ...emptyState(),
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
    };
  } catch {
    return emptyState();
  }
}

function saveState(state: GuestState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Переполнение localStorage не должно ломать занятие.
  }
}

function getClientSnapshot(): GuestState {
  if (!clientState) clientState = loadState();
  return clientState;
}

function getServerSnapshot(): GuestState {
  return serverState;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageBound && typeof window !== "undefined") {
    storageBound = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      clientState = loadState();
      for (const entry of listeners) entry();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

const getReady = () => true;
const getNotReady = () => false;

function updateState(updater: (previous: GuestState) => GuestState): void {
  clientState = updater(getClientSnapshot());
  saveState(clientState);
  for (const listener of listeners) listener();
}

function dayKey(date: Date): string {
  return date.toLocaleDateString("sv-SE");
}

function computeStats(state: GuestState): AppStats {
  const cards = Object.values(state.cards);
  const now = new Date();
  const today = dayKey(now);
  const reviewsToday = state.reviews.filter((review) => dayKey(new Date(review.createdAt)) === today).length;
  const newToday = cards.filter((card) => dayKey(new Date(card.createdAt)) === today).length;
  const stateCounts: Record<number, number> = {};
  for (const card of cards) stateCounts[card.state] = (stateCounts[card.state] ?? 0) + 1;

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - index));
    const key = dayKey(date);
    return {
      day: key,
      count: state.reviews.filter((review) => dayKey(new Date(review.createdAt)) === key).length,
    };
  });

  const days = [...new Set(state.reviews.map((review) => dayKey(new Date(review.createdAt))))].sort().reverse();
  let streak = 0;
  const cursor = new Date(now);
  if (days[0] !== today) cursor.setDate(cursor.getDate() - 1);
  for (const day of days) {
    if (day !== dayKey(cursor)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    totalWords: words.length,
    introduced: cards.length,
    dueNow: cards.filter((card) => isDue(card, now)).length,
    reviewsToday,
    newToday,
    streak,
    stateCounts,
    lastSevenDays,
    leeches: cards.filter((card) => card.lapses >= 3).sort((a, b) => b.lapses - a.lapses).slice(0, 10),
  };
}

function buildSession(state: GuestState): SessionItem[] {
  const now = new Date();
  const stats = computeStats(state);
  const cards = Object.values(state.cards);
  const due = cards
    .filter((card) => isDue(card, now))
    .sort((a, b) => a.due.localeCompare(b.due))
    .map<SessionItem>((card) => ({ kind: "review", wordId: card.wordId }));
  const already = new Set(due.map((item) => item.wordId));
  const limit = Math.max(0, state.settings.dailyGoal - stats.newToday);
  const fresh = words
    .filter((word) => !state.cards[word.id] && !already.has(word.id))
    .slice(0, limit)
    .map<SessionItem>((word) => ({ kind: "new", wordId: word.id }));
  return [...due, ...fresh];
}

type GuestContextValue = {
  ready: boolean;
  settings: Settings;
  cards: Record<string, CardRow>;
  reviews: ReviewRow[];
  cardByWord: Map<number, CardRow>;
  preferred: Map<number, string>;
  newWords: Word[];
  stats: AppStats;
  session: SessionItem[];
  updateSettings: (patch: Partial<Settings>) => void;
  selectMnemonic: (wordId: number, mnemonicId: string, mode: "initial" | "replace") => void;
  rateCard: (wordId: number, rating: RatingValue, usedHint: boolean) => CardRow | null;
  reset: () => void;
};

const GuestContext = createContext<GuestContextValue | null>(null);

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(subscribe, getReady, getNotReady);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.reducedMotion = state.settings.reducedMotion ? "true" : "false";
  }, [ready, state.settings.reducedMotion]);

  const cardByWord = useMemo(() => {
    const map = new Map<number, CardRow>();
    for (const card of Object.values(state.cards)) map.set(card.wordId, card);
    return map;
  }, [state.cards]);

  const preferred = useMemo(
    () => new Map(Object.entries(state.selections).map(([id, value]) => [Number(id), value])),
    [state.selections],
  );

  const newWords = useMemo(
    () => words.filter((word) => !cardByWord.has(word.id)),
    [cardByWord],
  );

  const stats = useMemo(() => (ready ? computeStats(state) : emptyStats), [ready, state]);
  const session = useMemo(() => (ready ? buildSession(state) : []), [ready, state]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    updateState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const selectMnemonic = useCallback(
    (wordId: number, mnemonicId: string, mode: "initial" | "replace") => {
      const now = new Date();
      updateState((prev) => {
        const cards = { ...prev.cards };
        if (mode === "initial" && !cards[String(wordId)]) {
          const card = createNewCard(wordId, now);
          cards[String(wordId)] = card;
        }
        return {
          ...prev,
          cards,
          selections: { ...prev.selections, [String(wordId)]: mnemonicId },
          updatedAt: now.toISOString(),
        };
      });
    },
    [],
  );

  const rateCard = useCallback(
    (wordId: number, rating: RatingValue, usedHint: boolean): CardRow | null => {
      const current = getClientSnapshot().cards[String(wordId)];
      if (!current) return null;
      const now = new Date();
      const updated = applyRating(current, rating, now);
      const review: ReviewRow = {
        id: `rev-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        cardId: updated.id,
        rating,
        usedHint,
        createdAt: now.toISOString(),
      };
      updateState((prev) => ({
        ...prev,
        cards: { ...prev.cards, [String(wordId)]: updated },
        reviews: [...prev.reviews, review],
        updatedAt: now.toISOString(),
      }));
      return updated;
    },
    [],
  );

  const reset = useCallback(() => {
    updateState(() => emptyState());
  }, []);

  const value = useMemo<GuestContextValue>(
    () => ({
      ready,
      settings: state.settings,
      cards: state.cards,
      reviews: state.reviews,
      cardByWord,
      preferred,
      newWords,
      stats,
      session,
      updateSettings,
      selectMnemonic,
      rateCard,
      reset,
    }),
    [
      ready,
      state.settings,
      state.cards,
      state.reviews,
      cardByWord,
      preferred,
      newWords,
      stats,
      session,
      updateSettings,
      selectMnemonic,
      rateCard,
      reset,
    ],
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

/** Доступ к локальному прогрессу гостя. */
export function useGuest(): GuestContextValue {
  const context = useContext(GuestContext);
  if (!context) throw new Error("useGuest должен вызываться внутри GuestProvider");
  return context;
}
