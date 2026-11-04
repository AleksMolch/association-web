import type {
  UserMnemonic,
} from "@/features/user-mnemonics/types";
import type { GuestState } from "@/lib/guest-store";
import {
  defaultSettings,
  type CardRow,
  type ReviewRow,
  type Settings,
} from "@/lib/types";

export type ServerProgress = {
  cards?: CardRow[];
  selections?: Record<string, string>;
  settings?: Partial<Settings>;
  userMnemonics?: UserMnemonic[];
};

export type ProgressSource = Pick<
  GuestState,
  "cards" | "selections" | "settings" | "reviews" | "userMnemonics"
>;

export type SyncUserMnemonic = {
  id: string;
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
  locale: "ru";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rev: number;
};

export type ProgressPushPayload = {
  cards: CardRow[];
  selections: Record<string, string>;
  settings: Settings;
  reviews: ReviewRow[];
  userMnemonics: SyncUserMnemonic[];
};

export type SyncCounts = {
  cards: number;
  selections: number;
  userMnemonics: number;
};

export type SyncMergeResult = {
  state: GuestState;
  pulled: SyncCounts;
};

export class ProgressSyncError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProgressSyncError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUserMnemonic(value: unknown): value is UserMnemonic {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.wordId === "number" &&
    Number.isInteger(value.wordId) &&
    value.wordId > 0 &&
    typeof value.meaningId === "string" &&
    typeof value.cueWord === "string" &&
    typeof value.sceneText === "string" &&
    value.locale === "ru" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    (value.deletedAt === null ||
      (typeof value.deletedAt === "string" &&
        Number.isFinite(Date.parse(value.deletedAt)))) &&
    typeof value.rev === "number" &&
    Number.isInteger(value.rev) &&
    value.rev >= 1
  );
}

function isCardRow(value: unknown): value is CardRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.wordId === "number" &&
    Number.isInteger(value.wordId) &&
    value.wordId > 0 &&
    typeof value.meaningId === "string" &&
    value.direction === "en-ru" &&
    typeof value.due === "string" &&
    Number.isFinite(Date.parse(value.due)) &&
    typeof value.stability === "number" &&
    Number.isFinite(value.stability) &&
    typeof value.difficulty === "number" &&
    Number.isFinite(value.difficulty) &&
    typeof value.scheduledDays === "number" &&
    Number.isInteger(value.scheduledDays) &&
    typeof value.reps === "number" &&
    Number.isInteger(value.reps) &&
    typeof value.lapses === "number" &&
    Number.isInteger(value.lapses) &&
    typeof value.learningSteps === "number" &&
    Number.isInteger(value.learningSteps) &&
    typeof value.state === "number" &&
    Number.isInteger(value.state) &&
    (value.lastReview === null ||
      (typeof value.lastReview === "string" &&
        Number.isFinite(Date.parse(value.lastReview)))) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    typeof value.rev === "number" &&
    Number.isInteger(value.rev) &&
    value.rev >= 1
  );
}

export function stripServerPrefix(userId: string, id: string): string {
  const prefix = `${userId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function timestampMs(value: string): number {
  return Date.parse(value);
}

function prefersIncomingCard(
  stored: CardRow,
  incoming: CardRow,
): boolean {
  if (incoming.rev !== stored.rev) return incoming.rev > stored.rev;

  const incomingMs = timestampMs(incoming.updatedAt);
  const storedMs = timestampMs(stored.updatedAt);

  return (
    Number.isFinite(incomingMs) &&
    Number.isFinite(storedMs) &&
    incomingMs > storedMs
  );
}

function prefersIncomingUserMnemonic(
  stored: UserMnemonic,
  incoming: UserMnemonic,
): boolean {
  if (incoming.rev !== stored.rev) return incoming.rev > stored.rev;

  const incomingMs = timestampMs(incoming.updatedAt);
  const storedMs = timestampMs(stored.updatedAt);

  if (!Number.isFinite(incomingMs) || !Number.isFinite(storedMs)) {
    return false;
  }

  if (incomingMs !== storedMs) return incomingMs > storedMs;

  return incoming.deletedAt !== null && stored.deletedAt === null;
}

function toClientUserMnemonic(
  userId: string,
  mnemonic: UserMnemonic,
): UserMnemonic {
  return {
    id: stripServerPrefix(userId, mnemonic.id),
    wordId: mnemonic.wordId,
    meaningId: mnemonic.meaningId,
    cueWord: mnemonic.cueWord,
    sceneText: mnemonic.sceneText,
    locale: "ru",
    createdAt: mnemonic.createdAt,
    updatedAt: mnemonic.updatedAt,
    deletedAt: mnemonic.deletedAt,
    rev: mnemonic.rev,
  };
}

function toSyncUserMnemonic(mnemonic: UserMnemonic): SyncUserMnemonic {
  return {
    id: mnemonic.id,
    wordId: mnemonic.wordId,
    meaningId: mnemonic.meaningId,
    cueWord: mnemonic.cueWord,
    sceneText: mnemonic.sceneText,
    locale: "ru",
    createdAt: mnemonic.createdAt,
    updatedAt: mnemonic.updatedAt,
    deletedAt: mnemonic.deletedAt,
    rev: mnemonic.rev,
  };
}

function toSyncReview(review: ReviewRow): ReviewRow {
  return {
    id: review.id,
    cardId: review.cardId,
    rating: review.rating,
    usedHint: review.usedHint,
    createdAt: review.createdAt,
  };
}

function normalizeSelections(
  userId: string,
  selections: Record<string, string> | undefined,
): Record<string, string> {
  if (!selections) return {};

  const normalized: Record<string, string> = {};

  for (const [wordId, mnemonicId] of Object.entries(selections)) {
    if (typeof mnemonicId !== "string") continue;
    normalized[wordId] = stripServerPrefix(userId, mnemonicId);
  }

  return normalized;
}

function normalizeCards(
  userId: string,
  cards: CardRow[] | undefined,
): CardRow[] {
  if (!cards) return [];

  return cards
    .filter(isCardRow)
    .map((card) => ({ ...card, id: stripServerPrefix(userId, card.id) }));
}

function hasLocalChanges(state: GuestState): boolean {
  if (Object.keys(state.cards).length > 0) return true;
  if (state.reviews.length > 0) return true;
  if (Object.keys(state.userMnemonics).length > 0) return true;

  return (Object.keys(defaultSettings) as (keyof Settings)[]).some(
    (key) => state.settings[key] !== defaultSettings[key],
  );
}

export function buildProgressPayload(
  source: ProgressSource,
): ProgressPushPayload {
  return {
    cards: Object.values(source.cards),
    selections: { ...source.selections },
    settings: { ...source.settings },
    reviews: source.reviews.map(toSyncReview),
    userMnemonics: Object.values(source.userMnemonics).map(toSyncUserMnemonic),
  };
}

export function mergeServerProgress(
  local: GuestState,
  server: ServerProgress,
  userId: string,
  now: Date = new Date(),
): SyncMergeResult {
  const userMnemonics: Record<string, UserMnemonic> = {};

  for (const record of Object.values(local.userMnemonics)) {
    const normalized = toClientUserMnemonic(userId, record);
    userMnemonics[normalized.id] = normalized;
  }

  let pulledUserMnemonics = 0;

  for (const record of server.userMnemonics ?? []) {
    if (!isUserMnemonic(record)) continue;

    const normalized = toClientUserMnemonic(userId, record);
    const existing = userMnemonics[normalized.id];

    if (!existing || prefersIncomingUserMnemonic(existing, normalized)) {
      userMnemonics[normalized.id] = normalized;
      pulledUserMnemonics += 1;
    }
  }

  const cards = { ...local.cards };
  let pulledCards = 0;

  for (const card of normalizeCards(userId, server.cards)) {
    const key = String(card.wordId);
    const existing = cards[key];

    if (!existing || prefersIncomingCard(existing, card)) {
      cards[key] = card;
      pulledCards += 1;
    }
  }

  const localSelections = normalizeSelections(userId, local.selections);
  const serverSelections = normalizeSelections(userId, server.selections);
  let pulledSelections = 0;

  for (const key of Object.keys(serverSelections)) {
    if (!(key in localSelections)) pulledSelections += 1;
  }

  const selections = { ...serverSelections, ...localSelections };
  const settings = hasLocalChanges(local)
    ? local.settings
    : { ...defaultSettings, ...(server.settings ?? {}) };

  return {
    state: {
      ...local,
      cards,
      selections,
      settings,
      userMnemonics,
      updatedAt: now.toISOString(),
    },
    pulled: {
      cards: pulledCards,
      selections: pulledSelections,
      userMnemonics: pulledUserMnemonics,
    },
  };
}

function normalizeServerProgress(raw: unknown): ServerProgress {
  if (!isRecord(raw)) return {};

  return {
    cards: Array.isArray(raw.cards) ? raw.cards.filter(isCardRow) : [],
    selections: isRecord(raw.selections)
      ? Object.fromEntries(
          Object.entries(raw.selections).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {},
    settings: isRecord(raw.settings)
      ? (raw.settings as Partial<Settings>)
      : undefined,
    userMnemonics: Array.isArray(raw.userMnemonics)
      ? raw.userMnemonics.filter(isUserMnemonic)
      : [],
  };
}

async function readProgressResponse(
  response: Response,
): Promise<ServerProgress> {
  if (!response.ok) {
    throw new ProgressSyncError(
      response.status,
      `Не удалось синхронизировать прогресс (${response.status})`,
    );
  }

  return normalizeServerProgress(await response.json().catch(() => null));
}

export async function pullProgress(): Promise<ServerProgress> {
  const response = await fetch("/api/progress", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return readProgressResponse(response);
}

export async function pushProgress(
  snapshot: ProgressSource,
): Promise<ServerProgress> {
  const response = await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildProgressPayload(snapshot)),
  });

  return readProgressResponse(response);
}
