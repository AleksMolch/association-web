// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { words } from "@/content";
import type { UserMnemonic } from "@/features/user-mnemonics/types";
import {
  activeUserMnemonicsFromState,
  createUserMnemonicInState,
  deleteUserMnemonicInState,
  migrateGuestState,
  resolveMnemonicFromState,
  selectMnemonicInState,
  type GuestState,
} from "@/lib/guest-store";
import { defaultSettings, type SessionItem } from "@/lib/types";

import { SessionRunner } from "./session-runner";

const mocks = vi.hoisted(() => ({
  guest: { current: {} as Record<string, unknown> },
  getLocalImage: vi.fn(),
  createObjectURL: vi.fn(() => "blob:trainer"),
  revokeObjectURL: vi.fn(),
}));

vi.mock("@/lib/guest-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guest-store")>();
  return { ...actual, useGuest: () => mocks.guest.current };
});

vi.mock("@/features/user-mnemonics/image-local-store", () => ({
  getLocalImage: mocks.getLocalImage,
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- lightweight next/image test double
    <img src={src} alt={alt} className={className} />
  ),
}));

const word = words.find((candidate) => candidate.mnemonics.length >= 2) ?? words[0];
const builtins = [...word.mnemonics].sort((a, b) => a.sortOrder - b.sortOrder);

const USER_INPUT = {
  wordId: word.id,
  meaningId: "0",
  cueWord: "Мой ключ",
  sceneText: "Моя сцена с братом",
};

const CREATED_AT = new Date("2026-11-04T09:00:00.000Z");
const SELECTED_AT = new Date("2026-11-04T09:05:00.000Z");
const DELETED_AT = new Date("2026-11-04T09:10:00.000Z");

function buildState(
  options: { select?: boolean; removeAfterSelect?: boolean } = {},
): { state: GuestState; mnemonic: UserMnemonic } {
  const created = createUserMnemonicInState(
    migrateGuestState(null),
    USER_INPUT,
    CREATED_AT,
  );
  let state = created.state;

  if (options.select !== false) {
    const selected = selectMnemonicInState(
      state,
      word.id,
      created.mnemonic.id,
      "initial",
      SELECTED_AT,
    );
    if (!selected) throw new Error("Failed to select the personal mnemonic");
    state = selected;
  }

  if (options.removeAfterSelect) {
    state = deleteUserMnemonicInState(state, created.mnemonic.id, DELETED_AT);
    state = {
      ...state,
      selections: { ...state.selections, [String(word.id)]: created.mnemonic.id },
    };
  }

  return { state, mnemonic: created.mnemonic };
}

function makeGuest(
  state: GuestState,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const cards = Object.values(state.cards);
  return {
    ready: true,
    settings: defaultSettings,
    cards: state.cards,
    reviews: state.reviews,
    userMnemonics: state.userMnemonics,
    activeUserMnemonics: activeUserMnemonicsFromState(state),
    cardByWord: new Map(cards.map((card) => [card.wordId, card])),
    preferred: new Map(
      Object.entries(state.selections).map(([id, value]) => [Number(id), value]),
    ),
    newWords: [],
    stats: {},
    session: [],
    updateSettings: vi.fn(),
    selectMnemonic: vi.fn(() => true),
    createUserMnemonic: vi.fn(),
    updateUserMnemonic: vi.fn(),
    deleteUserMnemonic: vi.fn(),
    setLocalMediaMeta: vi.fn(),
    deleteLocalMediaMeta: vi.fn(),
    resolveMnemonic: (wordId: number) => resolveMnemonicFromState(state, wordId),
    rateCard: vi.fn(() => cards[0] ?? null),
    reset: vi.fn(),
    ...overrides,
  };
}

function renderRunner(
  item: SessionItem,
  guest: Record<string, unknown>,
): { onNext: ReturnType<typeof vi.fn> } {
  mocks.guest.current = guest;
  const onNext = vi.fn();
  render(
    <SessionRunner item={item} index={0} total={1} onNext={onNext} />,
  );
  return { onNext };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocalImage.mockResolvedValue(
    new Blob(["image"], { type: "image/png" }),
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mocks.createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mocks.revokeObjectURL,
  });
});

afterEach(() => {
  cleanup();
});

describe("SessionRunner personal mnemonics", () => {
  it("shows the preferred personal variant in the hint and answer", async () => {
    const { state, mnemonic } = buildState();
    const card = Object.values(state.cards)[0];
    const guest = makeGuest(state, { rateCard: vi.fn(() => card) });

    renderRunner({ kind: "review", wordId: word.id }, guest);

    expect(screen.queryByText(USER_INPUT.sceneText)).toBeNull();

    fireEvent.keyDown(window, { key: "h" });

    expect(await screen.findByText(USER_INPUT.sceneText)).toBeTruthy();
    expect(screen.getByText("Мой")).toBeTruthy();
    expect(screen.queryByText(builtins[0].sceneText)).toBeNull();

    fireEvent.keyDown(window, { key: " " });

    const image = await screen.findByAltText(
      `Личная иллюстрация: ${USER_INPUT.sceneText}`,
    );
    expect(image.getAttribute("src")).toBe("blob:trainer");
    expect(mocks.getLocalImage).toHaveBeenCalledWith(mnemonic.id);
    expect(screen.getAllByText(USER_INPUT.sceneText).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Мой").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(builtins[0].sceneText)).toBeNull();

    fireEvent.keyDown(window, { key: "1" });

    await waitFor(() =>
      expect(guest.rateCard).toHaveBeenCalledWith(word.id, 1, true),
    );
  });

  it("falls back to the built-in when the preferred personal variant was deleted", async () => {
    const { state } = buildState({ removeAfterSelect: true });

    renderRunner({ kind: "review", wordId: word.id }, makeGuest(state));

    fireEvent.keyDown(window, { key: " " });

    expect(
      (await screen.findAllByText(builtins[0].sceneText)).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByAltText(`Иллюстрация: ${builtins[0].sceneText}`),
    ).toBeTruthy();
    expect(screen.queryByText("Мой")).toBeNull();
    expect(screen.queryByText(USER_INPUT.sceneText)).toBeNull();
    expect(screen.queryByAltText(/Личная иллюстрация/)).toBeNull();
    expect(mocks.getLocalImage).not.toHaveBeenCalled();
  });

  it("lists built-ins then active personal variants and creates one card on selection", async () => {
    const { state, mnemonic } = buildState({ select: false });
    let current = state;

    const selectMnemonic = vi.fn(
      (wordId: number, id: string, mode: "initial" | "replace") => {
        const next = selectMnemonicInState(
          current,
          wordId,
          id,
          mode,
          SELECTED_AT,
        );
        if (!next) return false;
        current = next;
        return true;
      },
    );

    const guest = makeGuest(state, {
      selectMnemonic,
      resolveMnemonic: (wordId: number) =>
        resolveMnemonicFromState(current, wordId),
    });
    mocks.getLocalImage.mockResolvedValue(null);

    renderRunner({ kind: "new", wordId: word.id }, guest);

    const options = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));

    expect(options).toHaveLength(builtins.length + 1);
    builtins.forEach((builtin, index) => {
      expect(options[index].textContent).toContain(builtin.sceneText);
    });
    expect(options[builtins.length].textContent).toContain(USER_INPUT.sceneText);
    expect(options[builtins.length].textContent).toContain("Мой");

    for (let index = 0; index < builtins.length; index += 1) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => expect(selectMnemonic).toHaveBeenCalledTimes(1));
    expect(selectMnemonic).toHaveBeenCalledWith(
      word.id,
      mnemonic.id,
      "initial",
    );
    expect(Object.keys(current.cards)).toHaveLength(1);
    expect(current.cards[String(word.id)]?.wordId).toBe(word.id);
    expect(current.selections[String(word.id)]).toBe(mnemonic.id);
    expect(await screen.findByText("Проверь себя")).toBeTruthy();
  });

  it("shows a placeholder without a local image when the blob is missing", async () => {
    const { state, mnemonic } = buildState();
    mocks.getLocalImage.mockResolvedValue(null);

    renderRunner({ kind: "review", wordId: word.id }, makeGuest(state));

    fireEvent.keyDown(window, { key: " " });

    expect(
      await screen.findByText(
        "Изображение хранится только на исходном устройстве или не добавлено",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByAltText(`Личная иллюстрация: ${USER_INPUT.sceneText}`),
    ).toBeNull();
    expect(mocks.getLocalImage).toHaveBeenCalledWith(mnemonic.id);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();

    const addImage = screen.getByRole("link", {
      name: "Добавить картинку на этом устройстве",
    });
    expect(addImage.getAttribute("href")).toBe(
      `/dashboard/words/${word.id}?edit=${mnemonic.id}`,
    );
  });

  it("не показывает диалог согласия во время занятия", () => {
    const { state } = buildState();

    renderRunner(
      { kind: "review", wordId: word.id },
      makeGuest(state, {
        settings: {
          ...defaultSettings,
          contributionConsent: "unset",
          userMnemonicCreatedCount: 3,
        },
      }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
