// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMnemonic } from "@/features/user-mnemonics/types";
import {
  createUserMnemonicInState,
  migrateGuestState,
  type GuestState,
} from "@/lib/guest-store";
import {
  mergeServerProgress,
  type ServerProgress,
} from "@/lib/sync-client";
import { defaultSettings } from "@/lib/types";

import { SyncLocal } from "./sync-local";

const mocks = vi.hoisted(() => ({
  guest: { current: {} as Record<string, unknown> },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { id: "user-a" } } }),
}));

vi.mock("@/lib/guest-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guest-store")>();
  return { ...actual, useGuest: () => mocks.guest.current };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));

const EARLIER = "2026-11-04T09:00:00.000Z";
const LATER = "2026-11-04T10:00:00.000Z";

function localState(): { state: GuestState; mnemonic: UserMnemonic } {
  return createUserMnemonicInState(
    migrateGuestState(null),
    {
      wordId: 1,
      meaningId: "0",
      cueWord: "Локально",
      sceneText: "Локальная сцена",
    },
    new Date(EARLIER),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SyncLocal", () => {
  it("pulls before pushing and posts the merged personal mnemonics", async () => {
    const { state, mnemonic } = localState();
    const serverMnemonic: UserMnemonic = {
      ...mnemonic,
      id: `user-a:${mnemonic.id}`,
      cueWord: "Сервер",
      sceneText: "Серверная сцена",
      updatedAt: LATER,
      rev: 2,
    };
    const serverSnapshot: ServerProgress = {
      cards: [],
      selections: {},
      settings: defaultSettings,
      userMnemonics: [serverMnemonic],
    };

    let currentState = state;
    const applyServerProgress = vi.fn(
      (userId: string, server: ServerProgress) => {
        const result = mergeServerProgress(currentState, server, userId);
        currentState = result.state;
        return result;
      },
    );

    mocks.guest.current = {
      ready: true,
      cards: state.cards,
      userMnemonics: state.userMnemonics,
      applyServerProgress,
    };

    let posted: {
      userMnemonics: UserMnemonic[];
    } | null = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted = JSON.parse(String(init.body)) as {
          userMnemonics: UserMnemonic[];
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => serverSnapshot,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SyncLocal />);
    fireEvent.click(
      screen.getByRole("button", { name: "Синхронизировать прогресс" }),
    );

    await waitFor(() => expect(posted).not.toBeNull());

    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(applyServerProgress).toHaveBeenCalledTimes(1);
    expect(applyServerProgress.mock.calls[0]?.[0]).toBe("user-a");
    expect(posted).toMatchObject({
      userMnemonics: [
        {
          id: mnemonic.id,
          cueWord: "Сервер",
          sceneText: "Серверная сцена",
          rev: 2,
        },
      ],
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Получено: 0 карточек, 1 личных ассоциаций",
    );
  });
});
