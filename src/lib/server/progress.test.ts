import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import type { UserMnemonic } from "@/features/user-mnemonics/types";
import { syncBodySchema } from "@/lib/api/schemas";
import {
  isNewerRevision,
  isNewerTimestamp,
  mergeByRevision,
  mergeByTimestamp,
  mergeUserMnemonic,
  toMobileSettings,
  toUserMnemonicInsert,
  toWebProgress,
} from "@/lib/server/progress";

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

describe("revision last-write-wins", () => {
  it("accepts only a strictly higher revision", () => {
    expect(isNewerRevision(2, 1)).toBe(true);
    expect(isNewerRevision(1, 1)).toBe(false);
    expect(isNewerRevision(1, 2)).toBe(false);
  });

  it("keeps stored data when the incoming revision is lower or equal", () => {
    const stored = { rev: 4, value: "stored" };
    expect(mergeByRevision(stored, { rev: 3, value: "stale" })).toBe(stored);
    expect(mergeByRevision(stored, { rev: 4, value: "tie" })).toBe(stored);
  });

  it("applies the incoming record when its revision is higher", () => {
    const incoming = { rev: 5, value: "new" };
    expect(mergeByRevision({ rev: 4, value: "stored" }, incoming)).toBe(incoming);
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
      settings: {
        dailyGoal: 15,
        hintsEnabled: false,
        reducedMotion: true,
        ttsRate: 1.2,
        associationSwipeHintSeen: false,
        contributionConsent: "unset",
        contributionConsentVersion: null,
        contributionNextPromptAt: null,
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
  });
});
