/**
 * consent.test.ts — проверки автомата согласия на вклад.
 *
 * Покрывает полную таблицу переходов, паузу `ask_later`, условия показа
 * диалога и точные тексты из спецификации §9.2. Все даты передаются явно,
 * поэтому тесты не зависят от календаря.
 */

import { describe, expect, it } from "vitest";

import {
  CONSENT_COPY,
  CONSENT_VERSION,
  nextConsentState,
  shouldPrompt,
  type ConsentAction,
  type ConsentContext,
  type PromptContext,
} from "@/features/contributions/consent";
import type { ContributionConsent } from "@/features/user-mnemonics/types";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const THIRTY_DAYS_LATER = "2026-12-05T12:00:00.000Z";
const STATUSES: ContributionConsent[] = [
  "unset",
  "granted",
  "declined",
  "ask_later",
  "withdrawn",
];
const ACTIONS: ConsentAction[] = [
  "grant",
  "decline",
  "ask_later",
  "withdraw",
];

const EXPECTED_STATUS: Record<ConsentAction, ContributionConsent> = {
  grant: "granted",
  decline: "declined",
  ask_later: "ask_later",
  withdraw: "withdrawn",
};

const transitionTable = STATUSES.flatMap((current) =>
  ACTIONS.map((action) => [current, action, EXPECTED_STATUS[action]] as const),
);

const promptContext: PromptContext = {
  createdCount: 3,
  status: "unset",
  authenticated: true,
  shownThisSession: false,
  now: NOW,
  nextPromptAt: null,
  promptAfterCount: null,
};

function prompt(overrides: Partial<PromptContext> = {}): boolean {
  return shouldPrompt({ ...promptContext, ...overrides });
}

describe("nextConsentState", () => {
  it.each(transitionTable)(
    "переводит %s по действию %s в %s",
    (current, action, expected) => {
      const decision = nextConsentState(current, action, {
        now: NOW,
        createdCount: 3,
      });

      expect(decision.status).toBe(expected);
      expect(decision.consentVersion).toBe(CONSENT_VERSION);
    },
  );

  it.each(["grant", "decline", "withdraw"] as const)(
    "сбрасывает таймеры при действии %s",
    (action) => {
      expect(
        nextConsentState("ask_later", action, {
          now: NOW,
          createdCount: 7,
        }),
      ).toEqual({
        status: EXPECTED_STATUS[action],
        consentVersion: CONSENT_VERSION,
        nextPromptAt: null,
        promptAfterCount: null,
      });
    },
  );

  it("идемпотентно выдаёт согласие повторно", () => {
    expect(
      nextConsentState("granted", "grant", { now: NOW, createdCount: 3 }),
    ).toEqual({
      status: "granted",
      consentVersion: CONSENT_VERSION,
      nextPromptAt: null,
      promptAfterCount: null,
    });
  });

  it("разрешает decline из withdrawn", () => {
    expect(
      nextConsentState("withdrawn", "decline", {
        now: NOW,
        createdCount: 3,
      }).status,
    ).toBe("declined");
  });

  it("ставит ask_later на 30 дней и +3 создания", () => {
    const context: ConsentContext = { now: NOW, createdCount: 7 };

    expect(nextConsentState("unset", "ask_later", context)).toEqual({
      status: "ask_later",
      consentVersion: CONSENT_VERSION,
      nextPromptAt: THIRTY_DAYS_LATER,
      promptAfterCount: 10,
    });
  });
});

describe("shouldPrompt", () => {
  it("показывает диалог после третьей ассоциации", () => {
    expect(prompt()).toBe(true);
    expect(prompt({ createdCount: 4 })).toBe(true);
  });

  it("не показывает диалог раньше третьей ассоциации", () => {
    expect(prompt({ createdCount: 2 })).toBe(false);
  });

  it.each(["granted", "declined", "withdrawn"] as const)(
    "не показывает диалог при статусе %s",
    (status) => {
      expect(prompt({ status, createdCount: 10 })).toBe(false);
    },
  );

  it("не показывает диалог без авторизации", () => {
    expect(prompt({ authenticated: false })).toBe(false);
  });

  it("не показывает диалог повторно в той же сессии", () => {
    expect(prompt({ shownThisSession: true })).toBe(false);
  });

  it("не показывает ask_later до наступления даты", () => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 6,
        nextPromptAt: THIRTY_DAYS_LATER,
        promptAfterCount: 6,
        now: new Date("2026-12-05T11:59:59.999Z"),
      }),
    ).toBe(false);
  });

  it("показывает ask_later на границе даты при достаточном числе созданий", () => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 6,
        nextPromptAt: THIRTY_DAYS_LATER,
        promptAfterCount: 6,
        now: new Date(THIRTY_DAYS_LATER),
      }),
    ).toBe(true);
  });

  it("не показывает ask_later после даты без трёх новых созданий", () => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 5,
        nextPromptAt: THIRTY_DAYS_LATER,
        promptAfterCount: 6,
        now: new Date("2026-12-20T12:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("показывает ask_later после даты при достаточном числе созданий", () => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 9,
        nextPromptAt: THIRTY_DAYS_LATER,
        promptAfterCount: 6,
        now: new Date("2026-12-20T12:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it.each([
    ["дата не задана", null],
    ["дата повреждена", "not-a-date"],
  ])("не показывает ask_later, если %s", (_label, nextPromptAt) => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 9,
        nextPromptAt,
        promptAfterCount: 6,
        now: new Date("2027-01-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("не показывает ask_later без порога по числу созданий", () => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 9,
        nextPromptAt: THIRTY_DAYS_LATER,
        promptAfterCount: null,
        now: new Date("2027-01-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("не показывает ask_later без авторизации после даты", () => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 9,
        nextPromptAt: THIRTY_DAYS_LATER,
        promptAfterCount: 6,
        now: new Date("2027-01-01T00:00:00.000Z"),
        authenticated: false,
      }),
    ).toBe(false);
  });

  it("не показывает ask_later повторно в той же сессии", () => {
    expect(
      prompt({
        status: "ask_later",
        createdCount: 9,
        nextPromptAt: THIRTY_DAYS_LATER,
        promptAfterCount: 6,
        now: new Date("2027-01-01T00:00:00.000Z"),
        shownThisSession: true,
      }),
    ).toBe(false);
  });

  it("игнорирует таймеры ask_later для статуса unset", () => {
    expect(
      prompt({
        status: "unset",
        createdCount: 3,
        nextPromptAt: "2999-01-01T00:00:00.000Z",
        promptAfterCount: 99,
      }),
    ).toBe(true);
  });
});

describe("CONSENT_COPY", () => {
  it("содержит точный заголовок и текст диалога", () => {
    expect(CONSENT_COPY.title).toBe("Поможете улучшить Association?");
    expect(CONSENT_COPY.body).toBe(
      "Вы создали несколько собственных ассоциаций. Если хотите, вы можете добровольно делиться их текстом с командой сервиса. Мы будем использовать варианты для отбора и создания лучших общих ассоциаций. Картинки, имена файлов и данные изображения не передаются. Настройку можно изменить в любое время.",
    );
  });

  it("содержит точные подписи кнопок и ссылки", () => {
    expect(CONSENT_COPY.grantButton).toBe("Да, делиться текстом");
    expect(CONSENT_COPY.declineButton).toBe("Не сейчас");
    expect(CONSENT_COPY.detailLink).toBe("Подробнее");
  });

  it("содержит фразу о непередаче изображений и имён файлов", () => {
    expect(CONSENT_COPY.body).toContain(
      "Картинки, имена файлов и данные изображения не передаются",
    );
  });

  it("содержит текст переключателя настроек", () => {
    expect(CONSENT_COPY.settingsTitle).toBe(
      "Делиться текстом моих ассоциаций",
    );
    expect(CONSENT_COPY.settingsDescription).toBe(
      "Передаются только созвучие и описание сцены вместе с идентификатором слова. Изображения не передаются.",
    );
  });

  it("фиксирует версию согласия 1.0", () => {
    expect(CONSENT_VERSION).toBe("1.0");
  });
});
