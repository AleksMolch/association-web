/**
 * consent-preferences.ts — чистые операции согласия над локальными настройками.
 *
 * Сервер хранит статус, версию и `nextPromptAt`, но не локальный счётчик
 * созданий. Поэтому `applyPreferenceToSettings` не трогает
 * `contributionPromptAfterCount`: для серверного `ask_later` он остаётся
 * `null`, и `shouldPrompt` использует только дату возврата. Если же пришёл
 * ответ на собственное решение `ask_later`, локальный порог сохраняется.
 */

import {
  CONSENT_VERSION,
  nextConsentState,
  shouldPrompt,
  type ConsentAction,
} from "@/features/contributions/consent";
import type { ContributionConsent } from "@/features/user-mnemonics/types";

/** Локальные настройки, относящиеся к согласию на передачу текста. */
export type ConsentSettings = {
  contributionConsent: ContributionConsent;
  contributionConsentVersion: string | null;
  contributionNextPromptAt: string | null;
  contributionPromptAfterCount: number | null;
  userMnemonicCreatedCount: number;
};

/** Поля серверной настройки, которые переносятся в локальные настройки. */
export type ConsentPreferenceSnapshot = {
  status: ContributionConsent;
  consentVersion: string | null;
  nextPromptAt: string | null;
};

/** Решение о том, что делать при расхождении локального и серверного статуса. */
export type PreferenceReconciliation =
  | "apply_server"
  | "push_local"
  | "keep_local";

/** Условия показа диалога для текущих локальных настроек. */
export type ConsentPromptContext = {
  authenticated: boolean;
  shownThisSession: boolean;
  now: Date;
};

/**
 * Сверяет серверный статус с локальным решением.
 *
 * Серверный статус применяется только поверх локального `unset`. Если локально
 * уже есть решение и оно отличается, локальное считается авторитетным и его
 * нужно отправить на сервер, не перезаписывая настройки.
 */
export function reconcileConsentPreference(
  localStatus: ContributionConsent,
  serverStatus: ContributionConsent,
): PreferenceReconciliation {
  if (localStatus === "unset") {
    return serverStatus === "unset" ? "keep_local" : "apply_server";
  }

  return localStatus === serverStatus ? "keep_local" : "push_local";
}

/**
 * Переносит серверный статус, версию и дату в локальные настройки.
 *
 * Локальный `contributionPromptAfterCount` сохраняется: сервер не передаёт
 * порог числа созданий, поэтому для чужого `ask_later` он остаётся `null`
 * и включает режим «только дата» в `shouldPrompt`.
 */
export function applyPreferenceToSettings<T extends ConsentSettings>(
  settings: T,
  preference: ConsentPreferenceSnapshot,
): T {
  return {
    ...settings,
    contributionConsent: preference.status,
    contributionConsentVersion: preference.consentVersion,
    contributionNextPromptAt: preference.nextPromptAt,
  };
}

/**
 * Применяет действие пользователя к локальным настройкам согласия.
 *
 * Возвращает новую копию настроек с состоянием, версией и таймерами из
 * `nextConsentState`; счётчик созданий сохраняется без изменений.
 */
export function applyConsentAction<T extends ConsentSettings>(
  settings: T,
  action: ConsentAction,
  now: Date,
): T {
  const decision = nextConsentState(settings.contributionConsent, action, {
    now,
    createdCount: settings.userMnemonicCreatedCount,
  });

  return {
    ...settings,
    contributionConsent: decision.status,
    contributionConsentVersion: decision.consentVersion,
    contributionNextPromptAt: decision.nextPromptAt,
    contributionPromptAfterCount: decision.promptAfterCount,
  };
}

/**
 * Увеличивает счётчик успешно сохранённых ассоциаций на единицу.
 *
 * Счётчик меняется только после полного сохранения, включая изображение;
 * остальные поля настроек не затрагиваются.
 */
export function recordMnemonicCreation<T extends ConsentSettings>(
  settings: T,
): T {
  return {
    ...settings,
    userMnemonicCreatedCount: settings.userMnemonicCreatedCount + 1,
  };
}

/**
 * Проверяет показ диалога по текущим локальным настройкам.
 *
 * Удобная обёртка для экранов: таймеры, счётчик и статус берутся из настроек,
 * а авторизация и факт показа в сессии передаются явно.
 */
export function shouldPromptForSettings(
  settings: ConsentSettings,
  { authenticated, shownThisSession, now }: ConsentPromptContext,
): boolean {
  return shouldPrompt({
    createdCount: settings.userMnemonicCreatedCount,
    status: settings.contributionConsent,
    authenticated,
    shownThisSession,
    now,
    nextPromptAt: settings.contributionNextPromptAt,
    promptAfterCount: settings.contributionPromptAfterCount,
  });
}

export { CONSENT_VERSION };
