import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => {
  type ConflictUpdate = {
    target: unknown;
    set: Record<string, unknown>;
    setWhere: unknown;
  };
  type Conflict = { kind: "update"; config: ConflictUpdate } | { kind: "nothing" };
  type Write = { table: unknown; values: Record<string, unknown>; conflict?: Conflict };
  type Read = { table: unknown; where: unknown };

  const reads: Read[] = [];
  const writes: Write[] = [];
  const rows = new Map<unknown, unknown[]>();

  const tx = {
    insert(table: unknown) {
      const write: Write = { table, values: {} };
      return {
        values(values: Record<string, unknown>) {
          write.values = values;
          return {
            onConflictDoUpdate(config: ConflictUpdate) {
              write.conflict = { kind: "update", config };
              writes.push(write);
              return Promise.resolve();
            },
            onConflictDoNothing() {
              write.conflict = { kind: "nothing" };
              writes.push(write);
              return Promise.resolve();
            },
          };
        },
      };
    },
  };

  const db = {
    select() {
      return {
        from(table: unknown) {
          const read: Read = { table, where: undefined };
          return {
            where(where: unknown) {
              read.where = where;
              reads.push(read);
              return Promise.resolve(rows.get(table) ?? []);
            },
          };
        },
      };
    },
    transaction: async (callback: (transaction: typeof tx) => Promise<void>) => {
      await callback(tx);
    },
  };

  return {
    reads,
    writes,
    rows,
    db,
    reset() {
      reads.length = 0;
      writes.length = 0;
      rows.clear();
    },
  };
});

const routeMocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireVip: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/server/session", () => ({
  getServerSession: routeMocks.getServerSession,
}));
vi.mock("@/lib/server/entitlement", () => ({
  requireVip: routeMocks.requireVip,
}));

import { POST as postMobileSync } from "@/app/api/mobile/sync/route";
import { POST as postWebProgress } from "@/app/api/progress/route";
import type { UserMnemonic } from "@/features/user-mnemonics/types";
import type { CardRow } from "@/lib/types";
import { syncBodySchema } from "@/lib/api/schemas";
import {
  cards as cardsTable,
  reviews as reviewsTable,
  selections as selectionsTable,
  settings as settingsTable,
  userMnemonics as userMnemonicsTable,
} from "@/lib/db/schema";
import {
  applyProgress,
  isNewerRevision,
  isNewerTimestamp,
  loadProgress,
  mergeByRevision,
  mergeByTimestamp,
  mergeUserMnemonic,
  toMobileSettings,
  toUserMnemonicInsert,
  toWebProgress,
} from "@/lib/server/progress";

const dialect = new PgDialect();

function toQuery(value: unknown) {
  return dialect.sqlToQuery(value as SQL);
}

function normalizedSql(value: unknown): string {
  return toQuery(value)
    .sql.replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim();
}

function tableName(table: unknown): string {
  return getTableName(table as Parameters<typeof getTableName>[0]);
}

function writesFor(table: unknown) {
  return mocks.writes.filter((write) => write.table === table);
}

function card(overrides: Partial<CardRow> = {}): CardRow {
  return {
    id: "1:0:en-ru",
    wordId: 1,
    meaningId: "0",
    direction: "en-ru",
    due: "2026-11-04T00:00:00.000Z",
    stability: 1,
    difficulty: 1,
    scheduledDays: 1,
    reps: 1,
    lapses: 0,
    learningSteps: 0,
    state: 2,
    lastReview: null,
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
    rev: 1,
    ...overrides,
  };
}

function mnemonic(overrides: Partial<UserMnemonic> = {}): UserMnemonic {
  return {
    id: "client-mnemonic-1",
    wordId: 1,
    meaningId: "1",
    cueWord: "cue",
    sceneText: "scene text",
    locale: "ru",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    deletedAt: null,
    rev: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.reset();
});

describe("revision last-write-wins", () => {
  it("accepts only a strictly higher revision", () => {
    expect(isNewerRevision(2, 1)).toBe(true);
    expect(isNewerRevision(1, 1)).toBe(false);
    expect(isNewerRevision(1, 2)).toBe(false);
  });

  it("keeps stored data when the incoming revision is lower or fully equal", () => {
    const stored = { rev: 4, updatedAt: "2026-11-04T10:00:00.000Z", value: "stored" };
    expect(
      mergeByRevision(stored, {
        rev: 3,
        updatedAt: "2026-11-04T11:00:00.000Z",
        value: "stale",
      }),
    ).toBe(stored);
    expect(
      mergeByRevision(stored, {
        rev: 4,
        updatedAt: "2026-11-04T10:00:00.000Z",
        value: "tie",
      }),
    ).toBe(stored);
  });

  it("applies the later updatedAt for an equal revision and a higher revision", () => {
    const stored = { rev: 4, updatedAt: "2026-11-04T10:00:00.000Z", value: "stored" };
    const laterEqual = {
      rev: 4,
      updatedAt: "2026-11-04T11:00:00.000Z",
      value: "later",
    };
    const incoming = { rev: 5, updatedAt: "2026-11-04T09:00:00.000Z", value: "new" };

    expect(mergeByRevision(stored, laterEqual)).toBe(laterEqual);
    expect(mergeByRevision(stored, incoming)).toBe(incoming);
  });
});

describe("timestamp last-write-wins", () => {
  it("accepts only a strictly newer timestamp", () => {
    expect(isNewerTimestamp("2026-11-02T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toBe(true);
    expect(isNewerTimestamp("2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toBe(false);
    expect(isNewerTimestamp("2026-10-31T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toBe(false);
  });

  it("rejects invalid timestamps instead of overwriting", () => {
    expect(isNewerTimestamp("not-a-date", "2026-11-01T00:00:00.000Z")).toBe(false);
    expect(isNewerTimestamp("2026-11-02T00:00:00.000Z", "not-a-date")).toBe(false);
  });

  it("keeps stored selections or settings when the incoming timestamp is not newer", () => {
    const stored = { updatedAt: "2026-11-02T00:00:00.000Z", value: "stored" };
    expect(mergeByTimestamp(stored, { updatedAt: "2026-11-01T00:00:00.000Z", value: "stale" })).toBe(
      stored,
    );
    expect(mergeByTimestamp(stored, { updatedAt: "2026-11-02T00:00:00.000Z", value: "tie" })).toBe(
      stored,
    );
  });
});

describe("user mnemonic merge with tombstones", () => {
  it("does not overwrite a tombstone with an older active record", () => {
    const tombstone = mnemonic({
      rev: 4,
      deletedAt: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-03T00:00:00.000Z",
    });
    const staleActive = mnemonic({ rev: 3, cueWord: "stale" });

    expect(mergeUserMnemonic(tombstone, staleActive)).toBe(tombstone);
  });

  it("lets a higher-revision tombstone win over an active record", () => {
    const active = mnemonic({ rev: 2 });
    const tombstone = mnemonic({
      rev: 3,
      deletedAt: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-03T00:00:00.000Z",
    });

    expect(mergeUserMnemonic(active, tombstone)).toBe(tombstone);
  });

  it("keeps the newer active record when it has a higher revision", () => {
    const stored = mnemonic({ rev: 2, cueWord: "old" });
    const incoming = mnemonic({ rev: 3, cueWord: "new" });

    expect(mergeUserMnemonic(stored, incoming)).toBe(incoming);
  });

  it("uses updatedAt and tombstone tie-breaks for equal revisions", () => {
    const stored = mnemonic({
      rev: 2,
      cueWord: "stored",
      updatedAt: "2026-11-04T10:00:00.000Z",
    });
    const laterEdit = mnemonic({
      rev: 2,
      cueWord: "later",
      updatedAt: "2026-11-04T11:00:00.000Z",
    });
    const equalEdit = mnemonic({
      rev: 2,
      cueWord: "equal",
      updatedAt: "2026-11-04T10:00:00.000Z",
    });
    const equalTombstone = mnemonic({
      rev: 2,
      cueWord: "deleted",
      updatedAt: "2026-11-04T10:00:00.000Z",
      deletedAt: "2026-11-04T10:00:00.000Z",
    });
    const localTombstone = mnemonic({
      rev: 2,
      cueWord: "deleted",
      updatedAt: "2026-11-04T10:00:00.000Z",
      deletedAt: "2026-11-04T10:00:00.000Z",
    });

    expect(mergeUserMnemonic(stored, laterEdit)).toBe(laterEdit);
    expect(mergeUserMnemonic(stored, equalEdit)).toBe(stored);
    expect(mergeUserMnemonic(stored, equalTombstone)).toBe(equalTombstone);
    expect(mergeUserMnemonic(localTombstone, equalEdit)).toBe(localTombstone);
  });
});

describe("user mnemonic mapping", () => {
  it("prefixes the client id with the owner id", () => {
    const values = toUserMnemonicInsert("user-1", mnemonic());

    expect(values.id).toBe("user-1:client-mnemonic-1");
    expect(values.userId).toBe("user-1");
    expect(values.deletedAt).toBeNull();
  });

  it("does not double-prefix an id that is already a server id", () => {
    const values = toUserMnemonicInsert("user-1", mnemonic({ id: "user-1:client-mnemonic-1" }));

    expect(values.id).toBe("user-1:client-mnemonic-1");
  });

  it("strips any foreign prefix and re-prefixes with the session owner", () => {
    const values = toUserMnemonicInsert(
      "user-1",
      mnemonic({ id: "user-2:client-mnemonic-1" }),
    );
    const nested = toUserMnemonicInsert(
      "user-1",
      mnemonic({ id: "user-2:user-3:client-mnemonic-1" }),
    );

    expect(values.id).toBe("user-1:client-mnemonic-1");
    expect(values.userId).toBe("user-1");
    expect(nested.id).toBe("user-1:client-mnemonic-1");
  });
});

describe("mobile settings mapping", () => {
  it("returns defaults with an epoch timestamp when the user has no settings row", () => {
    expect(toMobileSettings(undefined)).toEqual({
      dailyGoal: 10,
      hintsEnabled: true,
      reducedMotion: false,
      ttsRate: 0.95,
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
  });
});

describe("loadProgress owner scoping", () => {
  it("filters all five reads by the session user id and maps the rows", async () => {
    const now = new Date("2026-11-04T00:00:00.000Z");
    mocks.rows.set(cardsTable, [
      {
        id: "user-a:1:0:en-ru",
        userId: "user-a",
        wordId: 1,
        meaningId: "0",
        direction: "en-ru",
        due: now,
        stability: 1,
        difficulty: 2,
        scheduledDays: 3,
        reps: 4,
        lapses: 5,
        learningSteps: 6,
        state: 2,
        lastReview: null,
        createdAt: now,
        updatedAt: now,
        rev: 7,
      },
    ]);
    mocks.rows.set(reviewsTable, [
      {
        id: "user-a:review-1",
        userId: "user-a",
        cardId: "user-a:1:0:en-ru",
        rating: 4,
        usedHint: true,
        exerciseType: "introduction",
        answer: "answer",
        createdAt: now,
      },
    ]);
    mocks.rows.set(selectionsTable, [
      {
        id: "user-a:1",
        userId: "user-a",
        wordId: 1,
        mnemonicId: "mnemonic-1",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mocks.rows.set(settingsTable, [
      {
        userId: "user-a",
        dailyGoal: 15,
        hintsEnabled: false,
        reducedMotion: true,
        ttsRate: 1.1,
        updatedAt: now,
      },
    ]);
    mocks.rows.set(userMnemonicsTable, [
      {
        id: "user-a:client-mnemonic-1",
        userId: "user-a",
        wordId: 1,
        meaningId: "1",
        cueWord: "cue",
        sceneText: "scene text",
        locale: "ru",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        rev: 2,
      },
    ]);

    const state = await loadProgress("user-a");

    expect(mocks.reads).toHaveLength(5);
    const filters = new Map(mocks.reads.map((read) => [tableName(read.table), toQuery(read.where)]));
    expect([...filters.keys()].sort()).toEqual([
      "cards",
      "reviews",
      "selections",
      "settings",
      "user_mnemonics",
    ]);
    for (const filter of filters.values()) {
      expect(filter.sql).toContain("user_id");
      expect(filter.params).toEqual(["user-a"]);
    }

    expect(state.cards[0]).toMatchObject({ id: "user-a:1:0:en-ru", rev: 7 });
    expect(state.reviews[0]).toMatchObject({
      id: "user-a:review-1",
      cardId: "user-a:1:0:en-ru",
      exerciseType: "introduction",
    });
    expect(state.selections[0]).toMatchObject({ wordId: 1, mnemonicId: "mnemonic-1" });
    expect(state.settings).toMatchObject({ dailyGoal: 15, ttsRate: 1.1 });
    expect(state.userMnemonics[0]).toMatchObject({ id: "user-a:client-mnemonic-1", rev: 2 });
  });
});

describe("applyProgress database operations", () => {
  it("guards card upserts with a strict rev last-write-wins condition", async () => {
    await applyProgress("user-a", { cards: [card({ rev: 3 })] });

    const [write] = writesFor(cardsTable);
    expect(write).toBeDefined();
    if (!write) throw new Error("missing card write");
    expect(write.values).toMatchObject({
      id: "user-a:1:0:en-ru",
      userId: "user-a",
      rev: 3,
    });
    expect(write.conflict?.kind).toBe("update");
    if (write.conflict?.kind !== "update") throw new Error("expected card upsert");

    expect(write.conflict.config.target).toEqual([cardsTable.userId, cardsTable.wordId]);
    expect(write.conflict.config.set).toMatchObject({ rev: 3 });
    expect(normalizedSql(write.conflict.config.setWhere)).toBe(
      "cards.rev < excluded.rev or (cards.rev = excluded.rev and cards.updated_at < excluded.updated_at)",
    );
  });

  it("guards selections and settings with strict updatedAt last-write-wins conditions", async () => {
    const updatedAt = "2026-11-05T00:00:00.000Z";

    await applyProgress("user-a", {
      selections: [{ wordId: 7, mnemonicId: "mnemonic-7", updatedAt }],
      settings: {
        dailyGoal: 15,
        hintsEnabled: false,
        reducedMotion: true,
        ttsRate: 1.1,
        updatedAt,
      },
    });

    const [selectionWrite] = writesFor(selectionsTable);
    expect(selectionWrite).toBeDefined();
    if (!selectionWrite) throw new Error("missing selection write");
    expect(selectionWrite.values).toMatchObject({
      id: "user-a:7",
      userId: "user-a",
      wordId: 7,
      mnemonicId: "mnemonic-7",
      updatedAt: new Date(updatedAt),
    });
    expect(selectionWrite.conflict?.kind).toBe("update");
    if (selectionWrite.conflict?.kind !== "update") throw new Error("expected selection upsert");
    expect(normalizedSql(selectionWrite.conflict.config.setWhere)).toBe(
      "selections.updated_at < excluded.updated_at",
    );

    const [settingsWrite] = writesFor(settingsTable);
    expect(settingsWrite).toBeDefined();
    if (!settingsWrite) throw new Error("missing settings write");
    expect(settingsWrite.values).toMatchObject({
      userId: "user-a",
      dailyGoal: 15,
      hintsEnabled: false,
      reducedMotion: true,
      ttsRate: 1.1,
      updatedAt: new Date(updatedAt),
    });
    expect(settingsWrite.conflict?.kind).toBe("update");
    if (settingsWrite.conflict?.kind !== "update") throw new Error("expected settings upsert");
    expect(normalizedSql(settingsWrite.conflict.config.setWhere)).toBe(
      "settings.updated_at < excluded.updated_at",
    );
  });

  it("writes user mnemonic tombstones with the rev guard and deletedAt in the update set", async () => {
    const deletedAt = "2026-11-05T00:00:00.000Z";
    await applyProgress("user-a", {
      userMnemonics: [mnemonic({ rev: 4, updatedAt: deletedAt, deletedAt })],
    });

    const [write] = writesFor(userMnemonicsTable);
    expect(write).toBeDefined();
    if (!write) throw new Error("missing user mnemonic write");
    expect(write.values).toMatchObject({
      id: "user-a:client-mnemonic-1",
      userId: "user-a",
      deletedAt: new Date(deletedAt),
      rev: 4,
    });
    expect(write.conflict?.kind).toBe("update");
    if (write.conflict?.kind !== "update") throw new Error("expected user mnemonic upsert");
    expect(write.conflict.config.set).toMatchObject({
      deletedAt: new Date(deletedAt),
      rev: 4,
    });
    expect(normalizedSql(write.conflict.config.setWhere)).toBe(
      "(user_mnemonics.user_id = excluded.user_id) and (user_mnemonics.rev < excluded.rev or (user_mnemonics.rev = excluded.rev and user_mnemonics.updated_at < excluded.updated_at) or (user_mnemonics.rev = excluded.rev and user_mnemonics.updated_at = excluded.updated_at and user_mnemonics.deleted_at is null and excluded.deleted_at is not null))",
    );
  });

  it("accepts explicit selection and settings timestamps for web clients", async () => {
    const selectionUpdatedAt = "2026-11-04T08:00:00.000Z";
    const settingsUpdatedAt = "2026-11-04T09:00:00.000Z";

    await applyProgress("user-a", {
      selections: { "7": "mnemonic-7" },
      selectionUpdatedAt: { "7": selectionUpdatedAt },
      settings: {
        dailyGoal: 15,
        hintsEnabled: false,
        reducedMotion: true,
        ttsRate: 1.1,
      },
      settingsUpdatedAt,
    });

    const [selectionWrite] = writesFor(selectionsTable);
    const [settingsWrite] = writesFor(settingsTable);

    expect(selectionWrite?.values.updatedAt).toEqual(new Date(selectionUpdatedAt));
    expect(settingsWrite?.values.updatedAt).toEqual(new Date(settingsUpdatedAt));
  });

  it("inserts duplicate reviews idempotently by server review id", async () => {
    const review = {
      id: "review-1",
      cardId: "1:0:en-ru",
      rating: 4 as const,
      usedHint: true,
      exerciseType: "introduction",
      answer: "answer",
      createdAt: "2026-11-04T00:00:00.000Z",
    };

    await applyProgress("user-a", { reviews: [review, review] });

    const writes = writesFor(reviewsTable);
    expect(writes).toHaveLength(2);
    for (const write of writes) {
      expect(write.values).toMatchObject({
        id: "user-a:review-1",
        userId: "user-a",
        cardId: "user-a:1:0:en-ru",
        exerciseType: "introduction",
        answer: "answer",
      });
      expect(write.conflict).toEqual({ kind: "nothing" });
    }
    expect(new Set(writes.map((write) => write.values.id)).size).toBe(1);
  });

  it("forces every insert to the session owner even when the payload spoofs userId", async () => {
    const updatedAt = "2026-11-05T00:00:00.000Z";
    const review = {
      id: "review-1",
      cardId: "1:0:en-ru",
      rating: 4 as const,
      usedHint: true,
      createdAt: "2026-11-04T00:00:00.000Z",
      userId: "user-b",
    };
    const selection = {
      wordId: 1,
      mnemonicId: "mnemonic-1",
      updatedAt,
      userId: "user-b",
    };
    const settings = {
      dailyGoal: 10 as const,
      hintsEnabled: true,
      reducedMotion: false,
      ttsRate: 0.95,
      updatedAt,
      userId: "user-b",
    };
    const spoofedCard = { ...card(), userId: "user-b" };

    await applyProgress("user-a", {
      cards: [spoofedCard],
      reviews: [review],
      selections: [selection],
      settings,
      userMnemonics: [{ ...mnemonic(), userId: "user-b" }],
    });

    expect(mocks.writes).toHaveLength(5);
    for (const write of mocks.writes) {
      expect(write.values.userId).toBe("user-a");
    }

    const ids = mocks.writes
      .filter((write) => write.table !== settingsTable)
      .map((write) => String(write.values.id));
    expect(ids).toHaveLength(4);
    for (const id of ids) {
      expect(id.startsWith("user-a:")).toBe(true);
    }
  });
});

describe("web progress compatibility", () => {
  it("keeps the legacy selections map and full settings shape while adding user mnemonics", () => {
    const personal = mnemonic({ id: "user-1:client-mnemonic-1" });
    const state = {
      cards: [],
      reviews: [],
      selections: [
        {
          wordId: 7,
          mnemonicId: "1-1",
          updatedAt: "2026-11-04T00:00:00.000Z",
        },
      ],
      settings: {
        dailyGoal: 15 as const,
        hintsEnabled: false,
        reducedMotion: true,
        ttsRate: 1.2,
        updatedAt: "2026-11-04T00:00:00.000Z",
      },
      userMnemonics: [personal],
    };

    expect(toWebProgress(state)).toEqual({
      cards: [],
      selections: { "7": "1-1" },
      selectionUpdatedAt: { "7": "2026-11-04T00:00:00.000Z" },
      settingsUpdatedAt: "2026-11-04T00:00:00.000Z",
      settings: {
        dailyGoal: 15,
        hintsEnabled: false,
        reducedMotion: true,
        ttsRate: 1.2,
        associationSwipeHintSeen: false,
        contributionConsent: "unset",
        contributionConsentVersion: null,
        contributionNextPromptAt: null,
        contributionPromptAfterCount: null,
        userMnemonicCreatedCount: 0,
      },
      userMnemonics: [personal],
    });
  });

  it("defaults web sync bodies to an empty user mnemonic list", () => {
    const parsed = syncBodySchema.parse({
      cards: [],
      selections: {},
      settings: {
        dailyGoal: 10,
        hintsEnabled: true,
        reducedMotion: false,
        ttsRate: 0.95,
      },
      reviews: [],
    });

    expect(parsed.userMnemonics).toEqual([]);
    expect(parsed.selectionUpdatedAt).toEqual({});
    expect(parsed.settingsUpdatedAt).toBeUndefined();
  });
});

describe("sync routes reject foreign mnemonic ids", () => {
  const session = { user: { id: "user-a" } };
  const settings = {
    dailyGoal: 10 as const,
    hintsEnabled: true,
    reducedMotion: false,
    ttsRate: 0.95,
  };
  const foreignActive = mnemonic({
    id: "user-b:known-mnemonic",
    rev: 5,
    updatedAt: "2026-11-05T00:00:00.000Z",
  });
  const foreignTombstone = mnemonic({
    id: "user-b:known-tombstone",
    rev: 6,
    updatedAt: "2026-11-05T01:00:00.000Z",
    deletedAt: "2026-11-05T01:00:00.000Z",
  });

  function request(url: string, body: unknown) {
    return new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function assertOwnerScoped(post: (request: Request) => Promise<Response>, body: unknown) {
    routeMocks.getServerSession.mockResolvedValue(session);
    routeMocks.requireVip.mockResolvedValue(true);

    const response = await post(request("http://localhost/api/sync", body));

    expect(response.status).toBe(200);
    const writes = writesFor(userMnemonicsTable);
    expect(writes).toHaveLength(2);
    expect(writes.map((write) => write.values.id)).toEqual([
      "user-a:known-mnemonic",
      "user-a:known-tombstone",
    ]);
    for (const write of writes) {
      expect(write.values.userId).toBe("user-a");
      expect(String(write.values.id).startsWith("user-b:")).toBe(false);
      expect(write.conflict?.kind).toBe("update");
      if (write.conflict?.kind !== "update") throw new Error("expected upsert");
      expect(normalizedSql(write.conflict.config.setWhere)).toContain(
        "user_mnemonics.user_id = excluded.user_id",
      );
    }
  }

  it("ignores a foreign id and tombstone via POST /api/progress", async () => {
    await assertOwnerScoped(postWebProgress, {
      cards: [],
      selections: {},
      settings,
      reviews: [],
      userMnemonics: [foreignActive, foreignTombstone],
    });
  });

  it("ignores a foreign id and tombstone via POST /api/mobile/sync", async () => {
    await assertOwnerScoped(postMobileSync, {
      cards: [],
      reviews: [],
      selections: [],
      settings: {
        ...settings,
        updatedAt: "2026-11-05T02:00:00.000Z",
      },
      userMnemonics: [foreignActive, foreignTombstone],
    });
  });
});
