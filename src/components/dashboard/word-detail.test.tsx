// @vitest-environment jsdom

import { StrictMode, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { words } from "@/content";
import { CONSENT_COPY, CONSENT_VERSION } from "@/features/contributions/consent";
import type { UserMnemonic } from "@/features/user-mnemonics/types";
import {
  ACCOUNT_MISMATCH_MESSAGE,
  GUEST_OWNER_KEY,
} from "@/lib/guest-owner";
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
  session: {
    current: { data: null as { user: { id: string } } | null, isPending: false },
  },
}));

vi.mock("@/lib/guest-store", () => ({
  useGuest: () => mocks.guest.current,
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => mocks.session.current,
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
    consentPromptShown: false,
    markConsentPromptShown: vi.fn(),
    markUserMnemonicCreated: vi.fn(),
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
  window.localStorage.clear();
  mocks.session.current = { data: null, isPending: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "unset",
        consentVersion: null,
        decidedAt: null,
        nextPromptAt: null,
      }),
    })),
  );
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
  vi.unstubAllGlobals();
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

describe("WordDetail consent", () => {
  function submitNewVariant(cueWord = "Новый ключ") {
    fireEvent.click(
      screen.getByRole("button", { name: "+ Добавить свой вариант" }),
    );
    fireEvent.change(screen.getByLabelText("Созвучие"), {
      target: { value: cueWord },
    });
    fireEvent.change(screen.getByLabelText("Сцена"), {
      target: { value: "Новая сцена с братом" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  }

  function stubServerPreference(
    status: string,
    nextPromptAt: string | null = null,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status,
          consentVersion: status === "unset" ? null : CONSENT_VERSION,
          decidedAt: null,
          nextPromptAt,
        }),
      })),
    );
  }

  it("блокирует создание личного текста под чужим аккаунтом", async () => {
    mocks.session.current = {
      data: { user: { id: "user-b" } },
      isPending: false,
    };
    window.localStorage.setItem(GUEST_OWNER_KEY, "user-a");
    const guest = renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 2 },
    });

    submitNewVariant();

    expect(guest.createUserMnemonic).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(ACCOUNT_MISMATCH_MESSAGE);
  });

  it("не отправляет согласие чужого аккаунта и применяет серверное", async () => {
    mocks.session.current = {
      data: { user: { id: "user-b" } },
      isPending: false,
    };
    window.localStorage.setItem(GUEST_OWNER_KEY, "user-a");
    stubServerPreference("unset");
    const guest = renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
    });

    await screen.findByRole("dialog", { name: CONSENT_COPY.title });
    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.detailLink }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.detailDeclineButton }),
    );

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(ACCOUNT_MISMATCH_MESSAGE),
    );
    expect(guest.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ contributionConsent: "declined" }),
    );
    expect(
      vi.mocked(fetch).mock.calls.some((call) => call[1]?.method === "PUT"),
    ).toBe(false);
  });

  it("увеличивает счётчик только после полного успешного создания", async () => {
    const guest = renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 2 },
      createUserMnemonic: vi.fn(() => ({ ...userMnemonic, id: "usr-new" })),
    });

    submitNewVariant();

    await waitFor(() =>
      expect(guest.markUserMnemonicCreated).toHaveBeenCalledTimes(1),
    );
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("не увеличивает счётчик, если изображение не сохранилось", async () => {
    mocks.putLocalImage.mockRejectedValue(
      new Error("Не удалось записать изображение"),
    );
    const guest = renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 2 },
      createUserMnemonic: vi.fn(() => ({ ...userMnemonic, id: "usr-new" })),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "+ Добавить свой вариант" }),
    );
    fireEvent.change(screen.getByLabelText("Изображение (необязательно)"), {
      target: {
        files: [new File(["image"], "scene.png", { type: "image/png" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Созвучие"), {
      target: { value: "Новый ключ" },
    });
    fireEvent.change(screen.getByLabelText("Сцена"), {
      target: { value: "Новая сцена с братом" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Текст сохранён"),
      ),
    );
    expect(guest.markUserMnemonicCreated).not.toHaveBeenCalled();
  });

  it("показывает диалог после третьей ассоциации и закрывает его по «Не сейчас»", async () => {
    mocks.session.current = {
      data: { user: { id: "user-a" } },
      isPending: false,
    };
    const guest = renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
    });

    expect(
      await screen.findByRole("dialog", { name: CONSENT_COPY.title }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.declineButton }),
    );

    expect(guest.markConsentPromptShown).toHaveBeenCalled();
    expect(guest.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ contributionConsent: "ask_later" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("не показывает диалог, пока серверная настройка загружается", async () => {
    mocks.session.current = {
      data: { user: { id: "user-a" } },
      isPending: false,
    };
    let resolve!: (response: Response) => void;
    const request = new Promise<Response>((next) => {
      resolve = next;
    });
    vi.stubGlobal("fetch", vi.fn(() => request));

    renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
    });

    expect(screen.queryByRole("dialog")).toBeNull();

    resolve({
      ok: true,
      status: 200,
      json: async () => ({
        status: "unset",
        consentVersion: null,
        decidedAt: null,
        nextPromptAt: null,
      }),
    } as Response);

    expect(
      await screen.findByRole("dialog", { name: CONSENT_COPY.title }),
    ).toBeTruthy();
  });

  it.each(["granted", "declined", "withdrawn"] as const)(
    "не показывает диалог, если на сервере уже статус %s",
    async (status) => {
      mocks.session.current = {
        data: { user: { id: "user-a" } },
        isPending: false,
      };
      stubServerPreference(status);
      const guest = renderDetail({
        settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
      });

      await waitFor(() =>
        expect(guest.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ contributionConsent: status }),
        ),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("не показывает диалог для серверного ask_later до срока", async () => {
    mocks.session.current = {
      data: { user: { id: "user-a" } },
      isPending: false,
    };
    stubServerPreference("ask_later", "2999-01-01T00:00:00.000Z");
    const guest = renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
    });

    await waitFor(() =>
      expect(guest.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ contributionConsent: "ask_later" }),
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("не закрывает диалог под StrictMode после отметки о показе", async () => {
    mocks.session.current = {
      data: { user: { id: "user-a" } },
      isPending: false,
    };

    function Harness() {
      const [shown, setShown] = useState(false);
      mocks.guest.current = makeGuest({
        settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
        consentPromptShown: shown,
        markConsentPromptShown: vi.fn(() => setShown(true)),
      });
      return <WordDetail wordId={word.id} />;
    }

    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    expect(
      await screen.findByRole("dialog", { name: CONSENT_COPY.title }),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      screen.getByRole("dialog", { name: CONSENT_COPY.title }),
    ).toBeTruthy();
  });

  it("не повторяет диалог, если он уже показан в этой сессии", () => {
    mocks.session.current = {
      data: { user: { id: "user-a" } },
      isPending: false,
    };
    renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
      consentPromptShown: true,
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("сохраняет отказ навсегда из подробностей", async () => {
    mocks.session.current = {
      data: { user: { id: "user-a" } },
      isPending: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          status: string;
          consentVersion: string;
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: body.status,
            consentVersion: body.consentVersion,
            decidedAt: null,
            nextPromptAt: null,
          }),
        };
      }),
    );
    const guest = renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
    });

    await screen.findByRole("dialog", { name: CONSENT_COPY.title });
    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.detailLink }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.detailDeclineButton }),
    );

    expect(guest.updateSettings).toHaveBeenCalledWith({
      contributionConsent: "declined",
      contributionConsentVersion: CONSENT_VERSION,
      contributionNextPromptAt: null,
      contributionPromptAfterCount: null,
    });
  });

  it("показывает подсказку о регистрации без блокирующего диалога", () => {
    renderDetail({
      settings: { ...defaultSettings, userMnemonicCreatedCount: 3 },
    });

    expect(
      screen.getByText(CONSENT_COPY.registrationHintTitle),
    ).toBeTruthy();
    expect(screen.getByText(CONSENT_COPY.registrationHintBody)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
