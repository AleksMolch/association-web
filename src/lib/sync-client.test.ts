import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { words } from "@/content";
import type {
  LocalMnemonicMedia,
  UserMnemonic,
} from "@/features/user-mnemonics/types";
import { createNewCard } from "@/lib/fsrs";
import {
  mergeServerUserMnemonicsInState,
  migrateGuestState,
  setLocalMediaMetaInState,
  type GuestState,
} from "@/lib/guest-store";
import {
  buildProgressPayload,
  mergeServerProgress,
  ProgressSyncError,
  pullProgress,
  pushProgress,
  stripServerPrefix,
} from "@/lib/sync-client";
import { defaultSettings } from "@/lib/types";

const USER_ID = "user-abc";
const NOW = new Date("2026-11-04T15:00:00.000Z");
const EARLIER = "2026-11-04T09:00:00.000Z";
const LATER = "2026-11-04T10:00:00.000Z";
const word = words[0];

function mnemonic(overrides: Partial<UserMnemonic> = {}): UserMnemonic {
  return {
    id: "usr-local",
    wordId: word.id,
    meaningId: "0",
    cueWord: "Брат",
    sceneText: "Брат похож на брата",
    locale: "ru",
    createdAt: EARLIER,
    updatedAt: EARLIER,
    deletedAt: null,
    rev: 1,
    ...overrides,
  };
}

function baseState(overrides: Partial<GuestState> = {}): GuestState {
  return { ...migrateGuestState(null), ...overrides };
}

function media(mnemonicId: string): LocalMnemonicMedia {
  return {
    mnemonicId,
    localUri: `indexeddb://association-user-images/images/${mnemonicId}`,
    mimeType: "image/webp",
    width: 1200,
    height: 900,
    byteSize: 150_000,
    checksum: "abc123",
    createdAt: EARLIER,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stripServerPrefix", () => {
  it("removes only the current owner prefix", () => {
    expect(stripServerPrefix(USER_ID, `${USER_ID}:usr-1`)).toBe("usr-1");
    expect(stripServerPrefix(USER_ID, "usr-1")).toBe("usr-1");
    expect(stripServerPrefix(USER_ID, "other-user:usr-1")).toBe(
      "other-user:usr-1",
    );
  });
});

describe("mergeServerProgress", () => {
  it("merges user mnemonics by rev, strips owner ids and respects tombstones", () => {
    const local = mnemonic();
    const localTombstone = mnemonic({
      id: "usr-stale",
      rev: 2,
      updatedAt: LATER,
      deletedAt: LATER,
    });
    const localMedia = media(local.id);
    const state = baseState({
      userMnemonics: {
        [local.id]: local,
        [localTombstone.id]: localTombstone,
      },
      localMediaMeta: { [local.id]: localMedia },
    });

    const result = mergeServerProgress(
      state,
      {
        userMnemonics: [
          mnemonic({
            id: `${USER_ID}:usr-local`,
            cueWord: "Братик",
            updatedAt: LATER,
            rev: 2,
          }),
          mnemonic({
            id: `${USER_ID}:usr-remote`,
            cueWord: "Друг",
            createdAt: LATER,
            updatedAt: LATER,
            rev: 3,
          }),
          mnemonic({
            id: `${USER_ID}:usr-stale`,
            rev: 1,
            deletedAt: null,
          }),
        ],
      },
      USER_ID,
      NOW,
    );

    expect(result.state.userMnemonics[local.id]).toMatchObject({
      id: local.id,
      cueWord: "Братик",
      rev: 2,
    });
    expect(result.state.userMnemonics[`${USER_ID}:usr-local`]).toBeUndefined();
    expect(result.state.userMnemonics["usr-remote"]).toMatchObject({
      id: "usr-remote",
      cueWord: "Друг",
      rev: 3,
    });
    expect(result.state.userMnemonics[localTombstone.id]).toMatchObject({
      deletedAt: LATER,
      rev: 2,
    });
    expect(result.pulled.userMnemonics).toBe(2);
    expect(result.state.localMediaMeta[local.id]).toEqual(localMedia);
    expect(result.state.updatedAt).toBe(NOW.toISOString());
  });

  it("keeps selections client-local and lets local preferences win", () => {
    const state = baseState({
      selections: {
        "1": `${USER_ID}:usr-local`,
        "2": "builtin-old",
      },
    });

    const result = mergeServerProgress(
      state,
      {
        selections: {
          "1": `${USER_ID}:usr-server`,
          "2": `${USER_ID}:usr-remote`,
          "3": "builtin-3",
        },
      },
      USER_ID,
      NOW,
    );

    expect(result.state.selections).toEqual({
      "1": "usr-local",
      "2": "builtin-old",
      "3": "builtin-3",
    });
    expect(result.pulled.selections).toBe(1);
  });

  it("merges cards by rev and normalizes server card ids", () => {
    const localCard = {
      ...createNewCard(word.id, new Date(EARLIER)),
      rev: 3,
    };
    const otherWord = words[1];
    const serverCard = {
      ...createNewCard(otherWord.id, new Date(EARLIER)),
      rev: 4,
    };
    const lowerServerCard = {
      ...localCard,
      id: `${USER_ID}:${localCard.id}`,
      rev: 2,
    };

    const result = mergeServerProgress(
      baseState({ cards: { [String(word.id)]: localCard } }),
      { cards: [lowerServerCard, serverCard] },
      USER_ID,
      NOW,
    );

    expect(result.state.cards[String(word.id)]).toEqual(localCard);
    expect(result.state.cards[String(otherWord.id)]).toMatchObject({
      id: serverCard.id,
      wordId: otherWord.id,
      rev: 4,
    });
    expect(result.pulled.cards).toBe(1);
  });

  it("adopts server settings on an empty device and keeps changed local settings", () => {
    const serverSettings = {
      ...defaultSettings,
      dailyGoal: 20 as const,
      ttsRate: 1.3,
    };

    const empty = mergeServerProgress(
      baseState(),
      { settings: serverSettings },
      USER_ID,
      NOW,
    );

    expect(empty.state.settings).toMatchObject({
      dailyGoal: 20,
      ttsRate: 1.3,
    });

    const local = mergeServerProgress(
      baseState({
        cards: { [String(word.id)]: createNewCard(word.id, new Date(EARLIER)) },
        settings: { ...defaultSettings, dailyGoal: 5 },
      }),
      { settings: serverSettings },
      USER_ID,
      NOW,
    );

    expect(local.state.settings.dailyGoal).toBe(5);
  });
});

describe("mergeServerUserMnemonicsInState", () => {
  it("writes pulled text, preserves matching media and keeps local tombstones", () => {
    const local = mnemonic();
    const localMedia = media(local.id);
    const tombstone = mnemonic({
      id: "usr-deleted",
      rev: 2,
      deletedAt: LATER,
      updatedAt: LATER,
    });
    const state = setLocalMediaMetaInState(
      baseState({
        userMnemonics: { [local.id]: local, [tombstone.id]: tombstone },
      }),
      localMedia,
      NOW,
    );

    const result = mergeServerUserMnemonicsInState(
      state,
      USER_ID,
      [
        mnemonic({
          id: `${USER_ID}:usr-local`,
          cueWord: "Братик",
          updatedAt: LATER,
          rev: 2,
        }),
        mnemonic({
          id: `${USER_ID}:usr-deleted`,
          rev: 1,
          deletedAt: null,
        }),
      ],
      NOW,
    );

    expect(result.applied).toBe(1);
    expect(result.state.userMnemonics[local.id]?.cueWord).toBe("Братик");
    expect(result.state.userMnemonics[tombstone.id]).toMatchObject({
      deletedAt: LATER,
      rev: 2,
    });
    expect(result.state.localMediaMeta[local.id]).toEqual(localMedia);
  });
});

describe("buildProgressPayload", () => {
  it("contains personal text only, without media, URI, Blob or base64 fields", () => {
    const local = mnemonic();
    const tainted = {
      ...local,
      userId: "spoofed-user",
      localUri: "indexeddb://association-user-images/images/usr-local",
      blob: new Blob(["image"], { type: "image/png" }),
      image: "/private/image.png",
      fileName: "private.png",
      base64: "data:image/png;base64,AAAA",
    } as unknown as UserMnemonic;
    const state = setLocalMediaMetaInState(
      baseState({ userMnemonics: { [local.id]: tainted } }),
      media(local.id),
      NOW,
    );

    const payload = buildProgressPayload(state);

    expect(payload.userMnemonics).toEqual([
      {
        id: "usr-local",
        wordId: word.id,
        meaningId: "0",
        cueWord: "Брат",
        sceneText: "Брат похож на брата",
        locale: "ru",
        createdAt: EARLIER,
        updatedAt: EARLIER,
        deletedAt: null,
        rev: 1,
      },
    ]);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("indexeddb://");
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("private.png");
    expect(serialized).not.toContain("localUri");
    expect(serialized).not.toContain("blob");
  });

  it("keeps merged state serializable without Blob data", () => {
    const local = mnemonic();
    const state = setLocalMediaMetaInState(
      baseState({ userMnemonics: { [local.id]: local } }),
      media(local.id),
      NOW,
    );

    const merged = mergeServerProgress(
      state,
      {
        userMnemonics: [
          mnemonic({
            id: `${USER_ID}:usr-local`,
            cueWord: "Братик",
            updatedAt: LATER,
            rev: 2,
          }),
        ],
      },
      USER_ID,
      NOW,
    );
    const serialized = JSON.stringify(merged.state);
    const parsed = JSON.parse(serialized) as GuestState;

    expect(serialized).not.toContain("[object Blob]");
    expect(parsed.localMediaMeta[local.id]).toEqual(media(local.id));
    expect(parsed.userMnemonics[local.id]).not.toHaveProperty("blob");
    expect(parsed.userMnemonics[local.id]).not.toHaveProperty("localUri");
  });
});

describe("pullProgress", () => {
  it("GETs /api/progress and returns the server snapshot", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cards: [],
        selections: { "1": `${USER_ID}:usr-local` },
        settings: defaultSettings,
        userMnemonics: [mnemonic({ id: `${USER_ID}:usr-local` })],
      }),
    } as Response);

    const result = await pullProgress();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/progress");
    expect(init.method).toBe("GET");
    expect(result.selections?.["1"]).toBe(`${USER_ID}:usr-local`);
    expect(result.userMnemonics?.[0]?.id).toBe(`${USER_ID}:usr-local`);
  });

  it("throws a typed error when the server rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED" }),
    } as Response);

    await expect(pullProgress()).rejects.toBeInstanceOf(ProgressSyncError);
  });
});

describe("pushProgress", () => {
  it("POSTs the sanitized snapshot to /api/progress", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cards: [],
        selections: {},
        settings: defaultSettings,
        userMnemonics: [],
      }),
    } as Response);
    const local = mnemonic();
    const tainted = {
      ...local,
      localUri: "indexeddb://association-user-images/images/usr-local",
      blob: new Blob(["image"], { type: "image/png" }),
      base64: "data:image/png;base64,AAAA",
    } as unknown as UserMnemonic;
    const state = baseState({ userMnemonics: { [local.id]: tainted } });

    await pushProgress(state);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/progress");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(String(init.body)) as {
      userMnemonics: UserMnemonic[];
    };
    expect(body.userMnemonics[0]?.cueWord).toBe("Брат");
    expect(body.userMnemonics[0]?.sceneText).toBe("Брат похож на брата");
    expect(JSON.stringify(body)).not.toContain("indexeddb://");
    expect(JSON.stringify(body)).not.toContain("base64");
    expect(JSON.stringify(body)).not.toContain("data:image");
  });
});
