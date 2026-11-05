// @vitest-environment jsdom

/**
 * page.test.tsx — настройка согласия в разделе «Конфиденциальность».
 *
 * Проверяет загрузку серверной настройки, блокировку действий до её
 * завершения, оптимистичные переключатели и защиту от устаревших ответов PUT.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSENT_COPY, CONSENT_VERSION } from "@/features/contributions/consent";
import { defaultSettings } from "@/lib/types";

import DashboardSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  guest: { current: {} as Record<string, unknown> },
  session: {
    current: { data: null as { user: { id: string } } | null, isPending: false },
  },
  updateSettings: vi.fn(),
  reset: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => mocks.session.current,
}));

vi.mock("@/lib/guest-store", () => ({
  useGuest: () => mocks.guest.current,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const PREFERENCE_UNAVAILABLE = "Настройка недоступна";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function serverPreference(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: "unset",
    consentVersion: null,
    decidedAt: null,
    nextPromptAt: null,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function installFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mount(
  withSession = true,
  settings: typeof defaultSettings = defaultSettings,
) {
  mocks.session.current = withSession
    ? { data: { user: { id: "user-a" } }, isPending: false }
    : { data: null, isPending: false };
  mocks.guest.current = {
    ready: true,
    settings: { ...settings },
    stats: { introduced: 0, totalWords: 100 },
    updateSettings: mocks.updateSettings,
    reset: mocks.reset,
  };
  render(<DashboardSettingsPage />);
}

function switchControl() {
  return screen.getByRole("switch", { name: CONSENT_COPY.settingsTitle });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.current = {
    data: { user: { id: "user-a" } },
    isPending: false,
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Настройки → Конфиденциальность", () => {
  it("показывает точный текст переключателя §9.3", async () => {
    installFetch(async () => jsonResponse(serverPreference()));
    mount();

    expect(screen.getByText("Конфиденциальность")).toBeTruthy();
    expect(screen.getByText("Улучшение сервиса")).toBeTruthy();
    expect(screen.getByText(CONSENT_COPY.settingsTitle)).toBeTruthy();
    expect(screen.getByText(CONSENT_COPY.settingsDescription)).toBeTruthy();

    await waitFor(() => expect((switchControl() as HTMLInputElement).disabled).toBe(false));
  });

  it("загружает серверную настройку и применяет её поверх локального unset", async () => {
    const fetchMock = installFetch(async () =>
      jsonResponse(
        serverPreference({
          status: "granted",
          consentVersion: CONSENT_VERSION,
          decidedAt: "2026-11-05T12:00:00.000Z",
        }),
      ),
    );
    mount();

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        contributionConsent: "granted",
        contributionConsentVersion: CONSENT_VERSION,
        contributionNextPromptAt: null,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/privacy/contribution-preference",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("не даёт менять настройку до завершения начальной загрузки", async () => {
    const request = deferred<Response>();
    installFetch(() => request.promise);
    mount();

    expect((switchControl() as HTMLInputElement).disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: CONSENT_COPY.detailDeclineButton,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    request.resolve(jsonResponse(serverPreference()));

    await waitFor(() => expect((switchControl() as HTMLInputElement).disabled).toBe(false));
  });

  it("включает согласие, отправляет PUT и применяет ответ сервера", async () => {
    const nextPromptAt = "2026-12-05T12:00:00.000Z";
    const fetchMock = installFetch(async (_url, init) => {
      if (init?.method === "PUT") {
        return jsonResponse(
          serverPreference({
            status: "granted",
            consentVersion: CONSENT_VERSION,
            nextPromptAt,
          }),
        );
      }
      return jsonResponse(serverPreference());
    });
    mount();

    await waitFor(() => expect((switchControl() as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(switchControl());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/privacy/contribution-preference",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            status: "granted",
            consentVersion: CONSENT_VERSION,
          }),
        }),
      ),
    );
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      contributionConsent: "granted",
      contributionConsentVersion: CONSENT_VERSION,
      contributionNextPromptAt: null,
      contributionPromptAfterCount: null,
    });
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        contributionConsent: "granted",
        contributionConsentVersion: CONSENT_VERSION,
        contributionNextPromptAt: nextPromptAt,
      }),
    );
  });

  it("отзывает согласие выключением переключателя", async () => {
    const fetchMock = installFetch(async (_url, init) => {
      if (init?.method === "PUT") {
        return jsonResponse(
          serverPreference({
            status: "withdrawn",
            consentVersion: CONSENT_VERSION,
          }),
        );
      }
      return jsonResponse(
        serverPreference({
          status: "granted",
          consentVersion: CONSENT_VERSION,
        }),
      );
    });
    mount(true, {
      ...defaultSettings,
      contributionConsent: "granted",
      contributionConsentVersion: CONSENT_VERSION,
    });

    await waitFor(() => expect((switchControl() as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(switchControl());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/privacy/contribution-preference",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            status: "withdrawn",
            consentVersion: CONSENT_VERSION,
          }),
        }),
      ),
    );
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ contributionConsent: "withdrawn" }),
    );
  });

  it("позволяет отказаться навсегда из раздела настроек", async () => {
    const fetchMock = installFetch(async (_url, init) => {
      if (init?.method === "PUT") {
        return jsonResponse(
          serverPreference({
            status: "declined",
            consentVersion: CONSENT_VERSION,
          }),
        );
      }
      return jsonResponse(serverPreference());
    });
    mount();

    await waitFor(() => expect((switchControl() as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.detailDeclineButton }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/privacy/contribution-preference",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            status: "declined",
            consentVersion: CONSENT_VERSION,
          }),
        }),
      ),
    );
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ contributionConsent: "declined" }),
    );
  });

  it("без сессии не ходит в API и сохраняет решение локально", async () => {
    const fetchMock = installFetch(async () => jsonResponse(serverPreference()));
    mount(false);

    expect(screen.queryByText(PREFERENCE_UNAVAILABLE)).toBeNull();
    fireEvent.click(switchControl());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ contributionConsent: "granted" }),
    );
  });

  it("игнорирует устаревший ответ PUT после нового решения", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let putCount = 0;
    const firstDate = "2026-12-05T12:00:00.000Z";
    const secondDate = "2027-01-05T12:00:00.000Z";
    installFetch(async (_url, init) => {
      if (init?.method === "PUT") {
        putCount += 1;
        return putCount === 1 ? first.promise : second.promise;
      }
      return jsonResponse(serverPreference());
    });
    mount();

    await waitFor(() => expect((switchControl() as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(switchControl());
    fireEvent.click(switchControl());
    await waitFor(() => expect(putCount).toBe(2));

    second.resolve(
      jsonResponse(
        serverPreference({
          status: "granted",
          consentVersion: CONSENT_VERSION,
          nextPromptAt: secondDate,
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ contributionNextPromptAt: secondDate }),
      ),
    );

    first.resolve(
      jsonResponse(
        serverPreference({
          status: "granted",
          consentVersion: CONSENT_VERSION,
          nextPromptAt: firstDate,
        }),
      ),
    );
    await Promise.resolve();

    expect(mocks.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ contributionNextPromptAt: firstDate }),
    );
  });
});
