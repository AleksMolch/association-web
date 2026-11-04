// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { words } from "@/content";
import type { UserMnemonic } from "@/features/user-mnemonics/types";
import { defaultSettings } from "@/lib/types";

import { WordDetail } from "./word-detail";

const mocks = vi.hoisted(() => ({
  getLocalImage: vi.fn(),
  putLocalImage: vi.fn(),
  deleteLocalImage: vi.fn(),
  requestPersistentStorage: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  guest: { current: {} as Record<string, unknown> },
}));

vi.mock("@/lib/guest-store", () => ({
  useGuest: () => mocks.guest.current,
}));

vi.mock("@/features/user-mnemonics/image-local-store", () => ({
  getLocalImage: mocks.getLocalImage,
  putLocalImage: mocks.putLocalImage,
  deleteLocalImage: mocks.deleteLocalImage,
  requestPersistentStorage: mocks.requestPersistentStorage,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

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
const firstBuiltin = builtins[0];

const userMnemonic: UserMnemonic = {
  id: "usr-1",
  wordId: word.id,
  meaningId: "0",
  cueWord: "Брат",
  sceneText: "Брат похож на брата",
  locale: "ru",
  createdAt: "2026-11-04T09:00:00.000Z",
  updatedAt: "2026-11-04T09:00:00.000Z",
  deletedAt: null,
  rev: 1,
};

function makeGuest(overrides: Record<string, unknown> = {}) {
  return {
    ready: true,
    settings: defaultSettings,
    cards: {},
    reviews: [],
    userMnemonics: { [userMnemonic.id]: userMnemonic },
    activeUserMnemonics: { [userMnemonic.id]: userMnemonic },
    cardByWord: new Map(),
    preferred: new Map([[word.id, userMnemonic.id]]),
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
    resolveMnemonic: vi.fn(),
    rateCard: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function renderDetail(overrides: Record<string, unknown> = {}) {
  const guest = makeGuest(overrides);
  mocks.guest.current = guest;
  render(<WordDetail wordId={word.id} />);
  return guest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocalImage.mockResolvedValue(null);
  mocks.putLocalImage.mockResolvedValue(null);
  mocks.deleteLocalImage.mockResolvedValue(undefined);
  mocks.requestPersistentStorage.mockResolvedValue(true);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe("WordDetail personal variants", () => {
  it("shows the «Мой» badge, labels actions with the cue and selects a variant", () => {
    const guest = renderDetail({ preferred: new Map() });

    expect(screen.getByText("Мой")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Выбрать вариант «Брат»" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Изменить вариант «Брат»" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Удалить вариант «Брат»" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать вариант «Брат»" }),
    );

    expect(guest.selectMnemonic).toHaveBeenCalledWith(
      word.id,
      userMnemonic.id,
      "initial",
    );
  });

  it("opens an empty editor for a new variant and a prefilled editor for edit", async () => {
    renderDetail();

    fireEvent.click(
      screen.getByRole("button", { name: "+ Добавить свой вариант" }),
    );
    expect(
      (screen.getByLabelText("Созвучие") as HTMLInputElement).value,
    ).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Изменить вариант «Брат»" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Созвучие") as HTMLInputElement).value,
      ).toBe(userMnemonic.cueWord),
    );
  });

  it("refreshes an existing card image after saving an edited image", async () => {
    let urlCount = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        urlCount += 1;
        return `blob:${urlCount}`;
      }),
    });
    mocks.getLocalImage.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    mocks.putLocalImage.mockResolvedValue({
      mnemonicId: userMnemonic.id,
      localUri: `indexeddb://association-user-images/images/${userMnemonic.id}`,
      mimeType: "image/webp",
      width: 800,
      height: 600,
      byteSize: 1024,
      checksum: "abc",
      createdAt: "2026-11-04T09:05:00.000Z",
    });
    renderDetail({
      updateUserMnemonic: vi.fn(() => userMnemonic),
    });

    const alt = `Личная иллюстрация: ${userMnemonic.sceneText}`;
    const initialSrc = (await screen.findByAltText(alt)).getAttribute("src");

    fireEvent.click(
      screen.getByRole("button", { name: "Изменить вариант «Брат»" }),
    );
    fireEvent.change(screen.getByLabelText("Изображение (необязательно)"), {
      target: {
        files: [new File(["new"], "new-scene.png", { type: "image/png" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(mocks.putLocalImage).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByAltText(alt).getAttribute("src")).not.toBe(
        initialSrc,
      ),
    );
  });

  it("warns and falls back to the first built-in when deleting the preferred variant", async () => {
    const guest = renderDetail();

    fireEvent.click(
      screen.getByRole("button", { name: "Удалить вариант «Брат»" }),
    );
    expect(
      screen.getByRole("group", { name: "Удалить личный вариант?" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Да, удалить" }));

    await waitFor(() =>
      expect(guest.deleteUserMnemonic).toHaveBeenCalledWith(
        userMnemonic.id,
      ),
    );
    expect(guest.deleteLocalMediaMeta).not.toHaveBeenCalled();
    expect(mocks.deleteLocalImage).toHaveBeenCalledWith(userMnemonic.id);
    expect(
      mocks.deleteLocalImage.mock.invocationCallOrder[0],
    ).toBeLessThan(
      (guest.deleteUserMnemonic as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0],
    );
    expect(guest.selectMnemonic).toHaveBeenCalledWith(
      word.id,
      firstBuiltin.id,
      "initial",
    );
  });

  it("keeps metadata and tombstone when the blob cannot be deleted", async () => {
    mocks.deleteLocalImage.mockRejectedValue(
      new Error("Хранилище недоступно"),
    );
    const guest = renderDetail();

    fireEvent.click(
      screen.getByRole("button", { name: "Удалить вариант «Брат»" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Да, удалить" }));

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Не удалось удалить изображение варианта",
      ),
    );
    expect(guest.deleteUserMnemonic).not.toHaveBeenCalled();
    expect(guest.selectMnemonic).not.toHaveBeenCalled();
  });

  it("does not delete before confirmation", () => {
    const guest = renderDetail();

    fireEvent.click(
      screen.getByRole("button", { name: "Удалить вариант «Брат»" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(guest.deleteUserMnemonic).not.toHaveBeenCalled();
    expect(mocks.deleteLocalImage).not.toHaveBeenCalled();
  });

  it("shows the cross-device placeholder and opens the editor to add an image", async () => {
    renderDetail();

    expect(
      await screen.findByText(
        "Изображение хранится только на исходном устройстве или не добавлено",
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Добавить картинку на этом устройстве",
      }),
    );

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Созвучие") as HTMLInputElement).value,
      ).toBe(userMnemonic.cueWord),
    );
  });

  it("opens the editor from an initial edit id", async () => {
    mocks.guest.current = makeGuest();
    render(
      <WordDetail wordId={word.id} initialEditId={userMnemonic.id} />,
    );

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Созвучие") as HTMLInputElement).value,
      ).toBe(userMnemonic.cueWord),
    );
  });

  it("renders personal text as text instead of HTML", () => {
    const injected: UserMnemonic = {
      ...userMnemonic,
      cueWord: '<img src=x onerror="alert(1)">',
      sceneText: '<script>alert("x")</script>',
    };
    mocks.guest.current = makeGuest({
      activeUserMnemonics: { [injected.id]: injected },
      userMnemonics: { [injected.id]: injected },
    });
    const { container } = render(<WordDetail wordId={word.id} />);

    expect(screen.getByText(injected.sceneText)).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
