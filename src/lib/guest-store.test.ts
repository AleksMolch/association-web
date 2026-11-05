/**
 * guest-store.test.ts — проверки миграции, CRUD и выбора личных ассоциаций.
 *
 * Тесты работают с чистыми функциями хранилища и не требуют браузерного
 * окружения: localStorage и React остаются за пределами проверок.
 */

import { describe, expect, it } from "vitest";

import { words } from "@/content";
import type { Mnemonic } from "@/content/types";
import { createNewCard } from "@/lib/fsrs";
import {
  activeUserMnemonicsFromState,
  createUserMnemonicInState,
  deleteLocalMediaMetaInState,
  deleteUserMnemonicInState,
  migrateGuestState,
  resolveMnemonicFromState,
  selectMnemonicInState,
  setLocalMediaMetaInState,
  updateSettingsInState,
  updateUserMnemonicInState,
  type GuestState,
} from "@/lib/guest-store";
import { defaultSettings, type CardRow, type ReviewRow } from "@/lib/types";
import type {
  LocalMnemonicMedia,
  UserMnemonic,
} from "@/features/user-mnemonics/types";

const word = words.find((candidate) => candidate.mnemonics.length >= 2) ?? words[0];
const builtins: Mnemonic[] = [...word.mnemonics].sort(
  (a, b) => a.sortOrder - b.sortOrder,
);
const firstBuiltin = builtins[0];
const secondBuiltin = builtins[1];

const NOW = new Date("2026-11-04T10:00:00.000Z");
const LATER = new Date("2026-11-04T11:30:00.000Z");
const EVEN_LATER = new Date("2026-11-04T12:45:00.000Z");

const card: CardRow = createNewCard(word.id, new Date("2026-11-01T08:00:00.000Z"));
const review: ReviewRow = {
  id: "rev-1",
  cardId: card.id,
  rating: 3,
  usedHint: false,
  createdAt: "2026-11-02T09:00:00.000Z",
};

const v1State = {
  version: 1,
  cards: { [String(card.wordId)]: card },
  selections: { [String(card.wordId)]: firstBuiltin.id },
  settings: {
    dailyGoal: 20,
    hintsEnabled: false,
    reducedMotion: true,
    ttsRate: 1.1,
    associationSwipeHintSeen: true,
  },
  reviews: [review],
  updatedAt: "2026-11-02T09:00:00.000Z",
};

const createInput = {
  wordId: word.id,
  meaningId: "0",
  cueWord: "Брат",
  sceneText: "Брат похож на брата",
};

function withCreatedMnemonic(): {
  state: GuestState;
  mnemonic: UserMnemonic;
} {
  return createUserMnemonicInState(migrateGuestState(null), createInput, NOW);
}

function requiredState(state: GuestState | null): GuestState {
  expect(state).not.toBeNull();
  return state as GuestState;
}

describe("migrateGuestState", () => {
  it("migrates version 1 cards, reviews, selections and settings", () => {
    const migrated = migrateGuestState(v1State);

    expect(migrated.version).toBe(2);
    expect(migrated.cards).toEqual(v1State.cards);
    expect(migrated.reviews).toEqual(v1State.reviews);
    expect(migrated.selections).toEqual(v1State.selections);
    expect(migrated.selectionUpdatedAt).toEqual({
      [String(card.wordId)]: v1State.updatedAt,
    });
    expect(migrated.settingsUpdatedAt).toBe(v1State.updatedAt);
    expect(migrated.updatedAt).toBe(v1State.updatedAt);
    expect(migrated.settings).toEqual({
      ...defaultSettings,
      ...v1State.settings,
      contributionConsent: "unset",
      contributionConsentVersion: null,
      contributionNextPromptAt: null,
      userMnemonicCreatedCount: 0,
    });
    expect(migrated.userMnemonics).toEqual({});
    expect(migrated.localMediaMeta).toEqual({});
  });

  it("fills missing legacy timestamps from the persisted updatedAt", () => {
    const updatedAt = "2026-11-04T12:00:00.000Z";
    const migrated = migrateGuestState({
      version: 2,
      cards: {},
      selections: { [String(word.id)]: firstBuiltin.id },
      settings: { ...defaultSettings, dailyGoal: 20 },
      reviews: [],
      userMnemonics: {},
      localMediaMeta: {},
      updatedAt,
    });

    expect(migrated.selectionUpdatedAt[String(word.id)]).toBe(updatedAt);
    expect(migrated.settingsUpdatedAt).toBe(updatedAt);
  });

  it("returns an empty version 2 state for unknown versions", () => {
    const migrated = migrateGuestState({ version: 99, cards: {} });

    expect(migrated.version).toBe(2);
    expect(migrated.cards).toEqual({});
    expect(migrated.settings).toEqual(defaultSettings);
  });

  it("round-trips persisted state without losing user data", () => {
    const { state, mnemonic } = withCreatedMnemonic();
    const media: LocalMnemonicMedia = {
      mnemonicId: mnemonic.id,
      localUri: `indexeddb://association-user-images/images/${mnemonic.id}`,
      mimeType: "image/webp",
      width: 1200,
      height: 900,
      byteSize: 150_000,
      checksum: "abc123",
      createdAt: NOW.toISOString(),
    };
    const persisted: GuestState = {
      ...state,
      localMediaMeta: { [mnemonic.id]: media },
    };

    const restored = migrateGuestState(JSON.parse(JSON.stringify(persisted)));

    expect(restored).toEqual(persisted);
  });
});

describe("user mnemonic CRUD", () => {
  it("creates a local mnemonic with revision 1 and no tombstone", () => {
    const { state, mnemonic } = withCreatedMnemonic();

    expect(mnemonic).toMatchObject({
      wordId: word.id,
      meaningId: "0",
      cueWord: "Брат",
      sceneText: "Брат похож на брата",
      locale: "ru",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      deletedAt: null,
      rev: 1,
    });
    expect(mnemonic.id).toMatch(/^usr-/);
    expect(state.userMnemonics[mnemonic.id]).toEqual(mnemonic);
  });

  it("updates text, bumps the revision and keeps the creation time", () => {
    const { state, mnemonic } = withCreatedMnemonic();

    const result = updateUserMnemonicInState(
      state,
      mnemonic.id,
      { cueWord: "Братик" },
      LATER,
    );

    expect(result).not.toBeNull();
    expect(result?.mnemonic).toMatchObject({
      id: mnemonic.id,
      cueWord: "Братик",
      sceneText: "Брат похож на брата",
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
      rev: 2,
    });
    expect(result?.state.userMnemonics[mnemonic.id]).toEqual(result?.mnemonic);
  });

  it("does not update an unknown or deleted mnemonic", () => {
    const { state, mnemonic } = withCreatedMnemonic();
    const deleted = deleteUserMnemonicInState(state, mnemonic.id, LATER);

    expect(
      updateUserMnemonicInState(state, "usr-missing", { cueWord: "Нет" }, LATER),
    ).toBeNull();
    expect(
      updateUserMnemonicInState(deleted, mnemonic.id, { cueWord: "Нет" }, LATER),
    ).toBeNull();
  });

  it("deletes by tombstone and clears the matching preference", () => {
    const { state, mnemonic } = withCreatedMnemonic();
    const selected: GuestState = {
      ...state,
      selections: { [String(word.id)]: mnemonic.id },
    };

    const deleted = deleteUserMnemonicInState(selected, mnemonic.id, LATER);

    expect(deleted.userMnemonics[mnemonic.id]).toMatchObject({
      id: mnemonic.id,
      deletedAt: LATER.toISOString(),
      updatedAt: LATER.toISOString(),
      rev: 2,
    });
    expect(deleted.selections[String(word.id)]).toBeUndefined();
  });

  it("does not bump the revision when deleting twice", () => {
    const { state, mnemonic } = withCreatedMnemonic();
    const deleted = deleteUserMnemonicInState(state, mnemonic.id, LATER);
    const repeated = deleteUserMnemonicInState(deleted, mnemonic.id, EVEN_LATER);

    expect(repeated.userMnemonics[mnemonic.id]?.rev).toBe(2);
    expect(repeated.userMnemonics[mnemonic.id]?.deletedAt).toBe(
      LATER.toISOString(),
    );
  });
});

describe("activeUserMnemonicsFromState", () => {
  it("keeps tombstones in storage but excludes them from the projection", () => {
    const first = withCreatedMnemonic();
    const second = createUserMnemonicInState(
      first.state,
      { ...createInput, cueWord: "Второй" },
      LATER,
    );
    const deleted = deleteUserMnemonicInState(
      second.state,
      first.mnemonic.id,
      EVEN_LATER,
    );

    const active = activeUserMnemonicsFromState(deleted);

    expect(deleted.userMnemonics[first.mnemonic.id]?.deletedAt).toBe(
      EVEN_LATER.toISOString(),
    );
    expect(Object.keys(active)).toEqual([second.mnemonic.id]);
    expect(active[second.mnemonic.id]).toEqual(second.mnemonic);
    expect(active[first.mnemonic.id]).toBeUndefined();
  });
});

describe("local media metadata", () => {
  const media: LocalMnemonicMedia = {
    mnemonicId: "usr-media-1",
    localUri: "indexeddb://association-user-images/images/usr-media-1",
    mimeType: "image/webp",
    width: 1200,
    height: 900,
    byteSize: 150_000,
    checksum: "abc123",
    createdAt: NOW.toISOString(),
  };

  it("stores and removes metadata without touching mnemonic records", () => {
    const state = migrateGuestState(null);

    const withMedia = setLocalMediaMetaInState(state, media, NOW);
    const withoutMedia = deleteLocalMediaMetaInState(
      withMedia,
      media.mnemonicId,
      LATER,
    );

    expect(withMedia.localMediaMeta[media.mnemonicId]).toEqual(media);
    expect(state.localMediaMeta).toEqual({});
    expect(withoutMedia.localMediaMeta[media.mnemonicId]).toBeUndefined();
  });
});

describe("resolveMnemonicFromState", () => {
  it("uses the preferred user mnemonic", () => {
    const { state, mnemonic } = withCreatedMnemonic();
    const selected: GuestState = {
      ...state,
      selections: { [String(word.id)]: mnemonic.id },
    };

    expect(resolveMnemonicFromState(selected, word.id)).toEqual({
      source: "user",
      mnemonic,
    });
  });

  it("uses the preferred built-in mnemonic", () => {
    const state = migrateGuestState({
      ...v1State,
      selections: { [String(word.id)]: secondBuiltin.id },
    });

    expect(resolveMnemonicFromState(state, word.id)).toEqual({
      source: "builtin",
      mnemonic: secondBuiltin,
    });
  });

  it("falls back to the first built-in without a preference", () => {
    const state = migrateGuestState({ ...v1State, selections: {} });

    expect(resolveMnemonicFromState(state, word.id)).toEqual({
      source: "builtin",
      mnemonic: firstBuiltin,
    });
  });

  it("excludes a deleted preferred mnemonic and falls back to built-in", () => {
    const { state, mnemonic } = withCreatedMnemonic();
    const stale: GuestState = {
      ...state,
      selections: { [String(word.id)]: mnemonic.id },
      userMnemonics: {
        ...state.userMnemonics,
        [mnemonic.id]: { ...mnemonic, deletedAt: LATER.toISOString() },
      },
    };

    expect(resolveMnemonicFromState(stale, word.id)).toEqual({
      source: "builtin",
      mnemonic: firstBuiltin,
    });
  });

  it("falls back to the first built-in for an unknown preference", () => {
    const state = migrateGuestState({
      ...v1State,
      selections: { [String(word.id)]: "usr-missing" },
    });

    expect(resolveMnemonicFromState(state, word.id)).toEqual({
      source: "builtin",
      mnemonic: firstBuiltin,
    });
  });

  it("returns null for an unknown word", () => {
    expect(resolveMnemonicFromState(migrateGuestState(null), 999_999)).toBeNull();
  });
});

describe("selectMnemonicInState", () => {
  it("accepts a user id and creates the card once on the first selection", () => {
    const { state, mnemonic } = withCreatedMnemonic();

    const first = requiredState(
      selectMnemonicInState(state, word.id, mnemonic.id, "initial", NOW),
    );
    const second = requiredState(
      selectMnemonicInState(
        first,
        word.id,
        firstBuiltin.id,
        "initial",
        LATER,
      ),
    );

    expect(first.cards[String(word.id)]).toBeDefined();
    expect(Object.keys(second.cards)).toHaveLength(1);
    expect(second.cards[String(word.id)]).toEqual(first.cards[String(word.id)]);
    expect(second.selections[String(word.id)]).toBe(firstBuiltin.id);
  });

  it("keeps the existing built-in selection behavior", () => {
    const state = requiredState(
      selectMnemonicInState(
        migrateGuestState(null),
        word.id,
        firstBuiltin.id,
        "initial",
        NOW,
      ),
    );

    expect(state.cards[String(word.id)]?.wordId).toBe(word.id);
    expect(state.selections[String(word.id)]).toBe(firstBuiltin.id);
  });

  it("does not create a card for a replace selection on a new word", () => {
    const state = requiredState(
      selectMnemonicInState(
        migrateGuestState(null),
        word.id,
        firstBuiltin.id,
        "replace",
        NOW,
      ),
    );

    expect(state.cards).toEqual({});
    expect(state.selections[String(word.id)]).toBe(firstBuiltin.id);
  });

  it("rejects an unknown id without creating a card or preference", () => {
    const state = migrateGuestState(null);

    const result = selectMnemonicInState(
      state,
      word.id,
      "usr-missing",
      "initial",
      NOW,
    );

    expect(result).toBeNull();
    expect(state.cards).toEqual({});
    expect(state.selections).toEqual({});
  });

  it("rejects a deleted user id without creating a card", () => {
    const { state, mnemonic } = withCreatedMnemonic();
    const deleted = deleteUserMnemonicInState(state, mnemonic.id, LATER);

    const result = selectMnemonicInState(
      deleted,
      word.id,
      mnemonic.id,
      "initial",
      NOW,
    );

    expect(result).toBeNull();
    expect(deleted.cards).toEqual({});
  });

  it("rejects a user id that belongs to another word", () => {
    const otherWord = words.find((candidate) => candidate.id !== word.id);
    expect(otherWord).toBeDefined();
    if (!otherWord) return;

    const created = createUserMnemonicInState(
      migrateGuestState(null),
      { ...createInput, wordId: otherWord.id },
      NOW,
    );

    const result = selectMnemonicInState(
      created.state,
      word.id,
      created.mnemonic.id,
      "initial",
      NOW,
    );

    expect(result).toBeNull();
    expect(created.state.cards).toEqual({});
    expect(created.state.selections).toEqual({});
  });
});

describe("local timestamps", () => {
  it("records a selection timestamp and does not bump it for the same value", () => {
    const first = requiredState(
      selectMnemonicInState(
        migrateGuestState(null),
        word.id,
        firstBuiltin.id,
        "initial",
        NOW,
      ),
    );
    const repeated = requiredState(
      selectMnemonicInState(
        first,
        word.id,
        firstBuiltin.id,
        "replace",
        LATER,
      ),
    );

    expect(first.selectionUpdatedAt[String(word.id)]).toBe(NOW.toISOString());
    expect(repeated.selectionUpdatedAt[String(word.id)]).toBe(NOW.toISOString());
    expect(repeated.updatedAt).toBe(first.updatedAt);
  });

  it("advances the selection timestamp when the preference changes", () => {
    const first = requiredState(
      selectMnemonicInState(
        migrateGuestState(null),
        word.id,
        firstBuiltin.id,
        "initial",
        NOW,
      ),
    );
    const changed = requiredState(
      selectMnemonicInState(
        first,
        word.id,
        secondBuiltin.id,
        "replace",
        LATER,
      ),
    );

    expect(changed.selectionUpdatedAt[String(word.id)]).toBe(
      LATER.toISOString(),
    );
  });

  it("does not bump settingsUpdatedAt for unchanged or non-sync settings", () => {
    const state = migrateGuestState(null);
    const unchanged = updateSettingsInState(
      state,
      { dailyGoal: state.settings.dailyGoal },
      NOW,
    );
    const consentOnly = updateSettingsInState(
      state,
      { contributionConsent: "granted" },
      NOW,
    );
    const changed = updateSettingsInState(
      state,
      { dailyGoal: 20 },
      LATER,
    );

    expect(unchanged).toBe(state);
    expect(consentOnly.settings.contributionConsent).toBe("granted");
    expect(consentOnly.settingsUpdatedAt).toBe(state.settingsUpdatedAt);
    expect(changed.settingsUpdatedAt).toBe(LATER.toISOString());
    expect(changed.updatedAt).toBe(LATER.toISOString());
  });
});
