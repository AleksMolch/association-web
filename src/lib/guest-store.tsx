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

import type {
  LocalMnemonicMedia,
  UserMnemonic,
} from "@/features/user-mnemonics/types";
import { getMnemonic, getWord, primaryMnemonic, words } from "@/content";
import type { Mnemonic, Word } from "@/content/types";
import { applyRating, createNewCard, isDue } from "@/lib/fsrs";
import {
  mergeServerProgress,
  type ServerProgress,
  type SyncMergeResult,
} from "@/lib/sync-client";
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

export type GuestState = {
  version: 2;
  cards: Record<string, CardRow>;
  selections: Record<string, string>;
  settings: Settings;
  reviews: ReviewRow[];
  userMnemonics: Record<string, UserMnemonic>;
  localMediaMeta: Record<string, LocalMnemonicMedia>;
  updatedAt: string;
};

export type CreateUserMnemonicInput = {
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
};

export type UpdateUserMnemonicPatch = {
  cueWord?: string;
  sceneText?: string;
};

export type ResolvedGuestMnemonic =
  | { source: "builtin"; mnemonic: Mnemonic }
  | { source: "user"; mnemonic: UserMnemonic };

const EMPTY_UPDATED_AT = "1970-01-01T00:00:00.000Z";

const emptyState = (): GuestState => ({
  version: 2,
  cards: {},
  selections: {},
  settings: { ...defaultSettings },
  reviews: [],
  userMnemonics: {},
  localMediaMeta: {},
  updatedAt: EMPTY_UPDATED_AT,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordOf<T>(value: unknown): Record<string, T> {
  return isRecord(value) ? (value as Record<string, T>) : {};
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Приводит сохранённое состояние версии 1 или 2 к актуальной версии 2. */
export function migrateGuestState(raw: unknown): GuestState {
  const fallback = emptyState();

  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2)) {
    return fallback;
  }

  return {
    version: 2,
    cards: recordOf<CardRow>(raw.cards),
    selections: recordOf<string>(raw.selections),
    settings: isRecord(raw.settings)
      ? { ...defaultSettings, ...(raw.settings as Partial<Settings>) }
      : { ...defaultSettings },
    reviews: arrayOf<ReviewRow>(raw.reviews),
    userMnemonics: recordOf<UserMnemonic>(raw.userMnemonics),
    localMediaMeta: recordOf<LocalMnemonicMedia>(raw.localMediaMeta),
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : EMPTY_UPDATED_AT,
  };
}

/** Возвращает только активные личные ассоциации, сохраняя raw record для sync. */
export function activeUserMnemonicsFromState(
  state: GuestState,
): Record<string, UserMnemonic> {
  const active: Record<string, UserMnemonic> = {};

  for (const [id, mnemonic] of Object.entries(state.userMnemonics)) {
    if (mnemonic.deletedAt === null) active[id] = mnemonic;
  }

  return active;
}

export function mergeServerUserMnemonicsInState(
  state: GuestState,
  userId: string,
  incoming: UserMnemonic[],
  now: Date = new Date(),
): { state: GuestState; applied: number } {
  const result = mergeServerProgress(
    state,
    { userMnemonics: incoming },
    userId,
    now,
  );

  return {
    state: result.state,
    applied: result.pulled.userMnemonics,
  };
}

function createLocalMnemonicId(now: Date): string {
  return `usr-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Добавляет личную ассоциацию с локальным id и первой ревизией. */
export function createUserMnemonicInState(
  state: GuestState,
  input: CreateUserMnemonicInput,
  now: Date = new Date(),
): { state: GuestState; mnemonic: UserMnemonic } {
  const iso = now.toISOString();
  const mnemonic: UserMnemonic = {
    id: createLocalMnemonicId(now),
    wordId: input.wordId,
    meaningId: input.meaningId,
    cueWord: input.cueWord,
    sceneText: input.sceneText,
    locale: "ru",
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
    rev: 1,
  };

  return {
    state: {
      ...state,
      userMnemonics: { ...state.userMnemonics, [mnemonic.id]: mnemonic },
      updatedAt: iso,
    },
    mnemonic,
  };
}

/** Обновляет текст активной личной ассоциации и увеличивает ревизию. */
export function updateUserMnemonicInState(
  state: GuestState,
  id: string,
  patch: UpdateUserMnemonicPatch,
  now: Date = new Date(),
): { state: GuestState; mnemonic: UserMnemonic } | null {
  const existing = state.userMnemonics[id];

  if (!existing || existing.deletedAt !== null) return null;

  const iso = now.toISOString();
  const mnemonic: UserMnemonic = {
    ...existing,
    cueWord: patch.cueWord ?? existing.cueWord,
    sceneText: patch.sceneText ?? existing.sceneText,
    updatedAt: iso,
    rev: existing.rev + 1,
  };

  return {
    state: {
      ...state,
      userMnemonics: { ...state.userMnemonics, [id]: mnemonic },
      updatedAt: iso,
    },
    mnemonic,
  };
}

/**
 * Помечает личную ассоциацию удалённой, сохраняя tombstone для синхронизации.
 * Предпочтение и локальные метаданные изображения удалённого варианта
 * очищаются, чтобы слово сразу вернулось к встроенной ассоциации.
 */
export function deleteUserMnemonicInState(
  state: GuestState,
  id: string,
  now: Date = new Date(),
): GuestState {
  const existing = state.userMnemonics[id];

  if (!existing || existing.deletedAt !== null) return state;

  const iso = now.toISOString();
  const selections = { ...state.selections };
  const wordKey = String(existing.wordId);

  if (selections[wordKey] === id) delete selections[wordKey];

  const localMediaMeta = { ...state.localMediaMeta };
  delete localMediaMeta[id];

  return {
    ...state,
    selections,
    userMnemonics: {
      ...state.userMnemonics,
      [id]: {
        ...existing,
        deletedAt: iso,
        updatedAt: iso,
        rev: existing.rev + 1,
      },
    },
    localMediaMeta,
    updatedAt: iso,
  };
}

/** Сохраняет только метаданные локального изображения (Blob остаётся в IndexedDB). */
export function setLocalMediaMetaInState(
  state: GuestState,
  media: LocalMnemonicMedia,
  now: Date = new Date(),
): GuestState {
  return {
    ...state,
    localMediaMeta: {
      ...state.localMediaMeta,
      [media.mnemonicId]: media,
    },
    updatedAt: now.toISOString(),
  };
}

/** Удаляет метаданные локального изображения, если они существуют. */
export function deleteLocalMediaMetaInState(
  state: GuestState,
  mnemonicId: string,
  now: Date = new Date(),
): GuestState {
  if (!(mnemonicId in state.localMediaMeta)) return state;

  const localMediaMeta = { ...state.localMediaMeta };
  delete localMediaMeta[mnemonicId];

  return {
    ...state,
    localMediaMeta,
    updatedAt: now.toISOString(),
  };
}

/**
 * Выбирает ассоциацию по сохранённому предпочтению.
 *
 * Активная личная запись этого слова имеет приоритет; удалённые и чужие
 * идентификаторы игнорируются, после чего используется первый встроенный
 * вариант по `sortOrder`.
 */
export function resolveMnemonicFromState(
  state: GuestState,
  wordId: number,
): ResolvedGuestMnemonic | null {
  const word = getWord(wordId);

  if (!word) return null;

  const preferredId = state.selections[String(wordId)];

  if (preferredId) {
    const userMatch = state.userMnemonics[preferredId];

    if (
      userMatch &&
      userMatch.wordId === wordId &&
      userMatch.deletedAt === null
    ) {
      return { source: "user", mnemonic: userMatch };
    }

    const builtinMatch = getMnemonic(word, preferredId);

    if (builtinMatch) {
      return { source: "builtin", mnemonic: builtinMatch };
    }
  }

  const fallback = primaryMnemonic(word);
  return fallback ? { source: "builtin", mnemonic: fallback } : null;
}

/**
 * Записывает выбор ассоциации и создаёт карточку только при первой записи.
 *
 * Id принимается только для активной личной ассоциации этого слова или
 * встроенного варианта; неизвестные, удалённые и чужие id не меняют состояние.
 */
export function selectMnemonicInState(
  state: GuestState,
  wordId: number,
  mnemonicId: string,
  mode: "initial" | "replace",
  now: Date = new Date(),
): GuestState | null {
  const userMatch = state.userMnemonics[mnemonicId];
  const isUserSelection =
    userMatch !== undefined &&
    userMatch.wordId === wordId &&
    userMatch.deletedAt === null;
  const isBuiltinSelection =
    getWord(wordId)?.mnemonics.some((mnemonic) => mnemonic.id === mnemonicId) ??
    false;

  if (!isUserSelection && !isBuiltinSelection) return null;

  const wordKey = String(wordId);
  const cards = { ...state.cards };

  if (mode === "initial" && !cards[wordKey]) {
    cards[wordKey] = createNewCard(wordId, now);
  }

  return {
    ...state,
    cards,
    selections: { ...state.selections, [wordKey]: mnemonicId },
    updatedAt: now.toISOString(),
  };
}

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
    return migrateGuestState(JSON.parse(raw));
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
  userMnemonics: Record<string, UserMnemonic>;
  activeUserMnemonics: Record<string, UserMnemonic>;
  cardByWord: Map<number, CardRow>;
  preferred: Map<number, string>;
  newWords: Word[];
  stats: AppStats;
  session: SessionItem[];
  updateSettings: (patch: Partial<Settings>) => void;
  selectMnemonic: (wordId: number, mnemonicId: string, mode: "initial" | "replace") => boolean;
  createUserMnemonic: (input: CreateUserMnemonicInput) => UserMnemonic;
  updateUserMnemonic: (
    id: string,
    patch: UpdateUserMnemonicPatch,
  ) => UserMnemonic | null;
  deleteUserMnemonic: (id: string) => void;
  setLocalMediaMeta: (media: LocalMnemonicMedia) => void;
  deleteLocalMediaMeta: (mnemonicId: string) => void;
  mergeServerUserMnemonics: (userId: string, incoming: UserMnemonic[]) => number;
  applyServerProgress: (
    userId: string,
    server: ServerProgress,
  ) => SyncMergeResult;
  resolveMnemonic: (wordId: number) => ResolvedGuestMnemonic | null;
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

  const activeUserMnemonics = useMemo(
    () => activeUserMnemonicsFromState(state),
    [state],
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
      const next = selectMnemonicInState(
        getClientSnapshot(),
        wordId,
        mnemonicId,
        mode,
      );
      if (!next) return false;
      updateState(() => next);
      return true;
    },
    [],
  );

  const createUserMnemonic = useCallback(
    (input: CreateUserMnemonicInput): UserMnemonic => {
      const result = createUserMnemonicInState(getClientSnapshot(), input);
      updateState(() => result.state);
      return result.mnemonic;
    },
    [],
  );

  const updateUserMnemonic = useCallback(
    (id: string, patch: UpdateUserMnemonicPatch): UserMnemonic | null => {
      const result = updateUserMnemonicInState(
        getClientSnapshot(),
        id,
        patch,
      );
      if (!result) return null;
      updateState(() => result.state);
      return result.mnemonic;
    },
    [],
  );

  const deleteUserMnemonic = useCallback((id: string) => {
    updateState((prev) => deleteUserMnemonicInState(prev, id));
  }, []);

  const setLocalMediaMeta = useCallback((media: LocalMnemonicMedia) => {
    updateState((prev) => setLocalMediaMetaInState(prev, media));
  }, []);

  const deleteLocalMediaMeta = useCallback((mnemonicId: string) => {
    updateState((prev) => deleteLocalMediaMetaInState(prev, mnemonicId));
  }, []);

  const mergeServerUserMnemonics = useCallback(
    (userId: string, incoming: UserMnemonic[]): number => {
      const result = mergeServerUserMnemonicsInState(
        getClientSnapshot(),
        userId,
        incoming,
      );
      updateState(() => result.state);
      return result.applied;
    },
    [],
  );

  const applyServerProgress = useCallback(
    (userId: string, server: ServerProgress): SyncMergeResult => {
      const result = mergeServerProgress(getClientSnapshot(), server, userId);
      updateState(() => result.state);
      return result;
    },
    [],
  );

  const resolveMnemonic = useCallback(
    (wordId: number) => resolveMnemonicFromState(state, wordId),
    [state],
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
      userMnemonics: state.userMnemonics,
      activeUserMnemonics,
      cardByWord,
      preferred,
      newWords,
      stats,
      session,
      updateSettings,
      selectMnemonic,
      createUserMnemonic,
      updateUserMnemonic,
      deleteUserMnemonic,
      setLocalMediaMeta,
      deleteLocalMediaMeta,
      mergeServerUserMnemonics,
      applyServerProgress,
      resolveMnemonic,
      rateCard,
      reset,
    }),
    [
      ready,
      state.settings,
      state.cards,
      state.reviews,
      state.userMnemonics,
      activeUserMnemonics,
      cardByWord,
      preferred,
      newWords,
      stats,
      session,
      updateSettings,
      selectMnemonic,
      createUserMnemonic,
      updateUserMnemonic,
      deleteUserMnemonic,
      setLocalMediaMeta,
      deleteLocalMediaMeta,
      mergeServerUserMnemonics,
      applyServerProgress,
      resolveMnemonic,
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
