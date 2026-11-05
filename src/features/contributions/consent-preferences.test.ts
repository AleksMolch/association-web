/**
 * consent-preferences.test.ts — сверка серверной настройки с локальными
 * настройками и условия показа диалога.
 *
 * Все даты передаются явно. Отдельно проверяется серверный `ask_later`:
 * сервер хранит только дату возврата, поэтому при отсутствии локального
 * порога по числу созданий действует только дата.
 */

import { describe, expect, it } from "vitest";

import {
  CONSENT_VERSION,
  applyConsentAction,
  applyPreferenceToSettings,
  reconcileConsentPreference,
  recordMnemonicCreation,
  shouldPromptForSettings,
  type ConsentSettings,
} from "@/features/contributions/consent-preferences";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const THIRTY_DAYS_LATER = "2026-12-05T12:00:00.000Z";

function settings(overrides: Partial<ConsentSettings> = {}): ConsentSettings {
  return {
    contributionConsent: "unset",
    contributionConsentVersion: null,
    contributionNextPromptAt: null,
    contributionPromptAfterCount: null,
    userMnemonicCreatedCount: 3,
    ...overrides,
  };
}

describe("reconcileConsentPreference", () => {
  it("применяет серверный статус только поверх локального unset", () => {
    expect(reconcileConsentPreference("unset", "granted")).toBe("apply_server");
    expect(reconcileConsentPreference("unset", "ask_later")).toBe(
      "apply_server",
    );
    expect(reconcileConsentPreference("unset", "unset")).toBe("keep_local");
  });

  it("считает локальное решение авторитетным при расхождении", () => {
    expect(reconcileConsentPreference("withdrawn", "granted")).toBe(
      "push_local",
    );
    expect(reconcileConsentPreference("declined", "granted")).toBe(
      "push_local",
    );
    expect(reconcileConsentPreference("granted", "withdrawn")).toBe(
      "push_local",
    );
    expect(reconcileConsentPreference("ask_later", "granted")).toBe(
      "push_local",
    );
  });

  it("оставляет локальное решение при совпадении статусов", () => {
    expect(reconcileConsentPreference("granted", "granted")).toBe(
      "keep_local",
    );
    expect(reconcileConsentPreference("withdrawn", "withdrawn")).toBe(
      "keep_local",
    );
  });
});

describe("applyPreferenceToSettings", () => {
  it("переносит статус, версию и дату, не трогая локальный счётчик", () => {
    const local = settings({
      contributionConsent: "unset",
      userMnemonicCreatedCount: 4,
    });

    expect(
      applyPreferenceToSettings(local, {
        status: "granted",
        consentVersion: "1.0",
        nextPromptAt: null,
      }),
    ).toEqual({
      ...local,
      contributionConsent: "granted",
      contributionConsentVersion: "1.0",
      contributionNextPromptAt: null,
    });
  });

  it("оставляет promptAfterCount пустым для серверного ask_later", () => {
    const applied = applyPreferenceToSettings(settings(), {
      status: "ask_later",
      consentVersion: "1.0",
      nextPromptAt: THIRTY_DAYS_LATER,
    });

    expect(applied.contributionPromptAfterCount).toBeNull();
    expect(
      shouldPromptForSettings(applied, {
        authenticated: true,
        shownThisSession: false,
        now: new Date("2026-12-04T12:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      shouldPromptForSettings(applied, {
        authenticated: true,
        shownThisSession: false,
        now: new Date("2026-12-05T12:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("сохраняет локальный порог ask_later при ответе на собственное решение", () => {
    const local = settings({
      contributionConsent: "ask_later",
      contributionConsentVersion: "1.0",
      contributionNextPromptAt: THIRTY_DAYS_LATER,
      contributionPromptAfterCount: 6,
      userMnemonicCreatedCount: 3,
    });

    const applied = applyPreferenceToSettings(local, {
      status: "ask_later",
      consentVersion: "1.0",
      nextPromptAt: THIRTY_DAYS_LATER,
    });

    expect(applied.contributionPromptAfterCount).toBe(6);
  });
});

describe("applyConsentAction", () => {
  it("сохраняет решение и версию согласия", () => {
    expect(applyConsentAction(settings(), "grant", NOW)).toEqual({
      ...settings(),
      contributionConsent: "granted",
      contributionConsentVersion: CONSENT_VERSION,
    });
    expect(applyConsentAction(settings(), "decline", NOW).contributionConsent).toBe(
      "declined",
    );
  });

  it("откладывает ask_later на 30 дней и +3 создания от текущего счётчика", () => {
    expect(
      applyConsentAction(
        settings({ userMnemonicCreatedCount: 7 }),
        "ask_later",
        NOW,
      ),
    ).toEqual({
      ...settings({ userMnemonicCreatedCount: 7 }),
      contributionConsent: "ask_later",
      contributionConsentVersion: CONSENT_VERSION,
      contributionNextPromptAt: THIRTY_DAYS_LATER,
      contributionPromptAfterCount: 10,
    });
  });

  it("сбрасывает таймеры при отзыве согласия", () => {
    expect(
      applyConsentAction(
        settings({
          contributionConsent: "ask_later",
          contributionNextPromptAt: THIRTY_DAYS_LATER,
          contributionPromptAfterCount: 6,
        }),
        "withdraw",
        NOW,
      ),
    ).toEqual({
      ...settings(),
      contributionConsent: "withdrawn",
      contributionConsentVersion: CONSENT_VERSION,
    });
  });
});

describe("recordMnemonicCreation", () => {
  it("увеличивает счётчик, не трогая остальные поля", () => {
    const local = settings({
      contributionConsent: "granted",
      contributionConsentVersion: "1.0",
      userMnemonicCreatedCount: 2,
    });

    expect(recordMnemonicCreation(local)).toEqual({
      ...local,
      userMnemonicCreatedCount: 3,
    });
  });
});

describe("shouldPromptForSettings", () => {
  const context = {
    authenticated: true,
    shownThisSession: false,
    now: NOW,
  };

  it("показывает диалог после третьей ассоциации", () => {
    expect(shouldPromptForSettings(settings(), context)).toBe(true);
  });

  it("не показывает диалог раньше третьей ассоциации", () => {
    expect(
      shouldPromptForSettings(
        settings({ userMnemonicCreatedCount: 2 }),
        context,
      ),
    ).toBe(false);
  });

  it("не показывает диалог без авторизации", () => {
    expect(
      shouldPromptForSettings(settings({ userMnemonicCreatedCount: 9 }), {
        ...context,
        authenticated: false,
      }),
    ).toBe(false);
  });

  it("не показывает диалог повторно в той же сессии", () => {
    expect(
      shouldPromptForSettings(settings({ userMnemonicCreatedCount: 9 }), {
        ...context,
        shownThisSession: true,
      }),
    ).toBe(false);
  });

  it.each(["granted", "declined", "withdrawn"] as const)(
    "не показывает диалог при статусе %s",
    (status) => {
      expect(
        shouldPromptForSettings(
          settings({
            contributionConsent: status,
            userMnemonicCreatedCount: 9,
          }),
          context,
        ),
      ).toBe(false);
    },
  );
});
