/**
 * cookie-consent.ts — согласие на cookie и аналогичные технологии.
 *
 * Хранит версию, дату/время решения, источник и категории. Версия жёстко
 * привязана к редакции Cookie-политики: при её изменении согласие
 * запрашивается заново.
 */

export type CookieConsentSource = "banner" | "settings";

export type CookieCategories = {
  necessary: true;
  advertising: boolean;
  analytics: boolean;
};

export type CookieConsentRecord = {
  version: string;
  decidedAt: string;
  source: CookieConsentSource;
  categories: CookieCategories;
};

export const COOKIE_CONSENT_VERSION = "2026-11-14";
export const COOKIE_CONSENT_KEY = "mnemoslov_cookie_consent_v2";
export const COOKIE_CONSENT_EVENT = "mnemoslov-cookie-consent-change";

const LEGACY_KEY = "mnemoslov_cookie_consent_v1";

let cached: CookieConsentRecord | null | undefined;
const listeners = new Set<() => void>();

function read(): CookieConsentRecord | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CookieConsentRecord;
      if (parsed && typeof parsed.version === "string" && parsed.categories) {
        cached = parsed;
        return parsed;
      }
    }
  } catch {
    // повреждённая запись
  }
  // Легаси-значение без версии/даты не является доказательством — переспрашиваем.
  cached = null;
  return null;
}

export function setCookieConsent(
  advertising: boolean,
  source: CookieConsentSource,
): CookieConsentRecord {
  const record: CookieConsentRecord = {
    version: COOKIE_CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    source,
    categories: { necessary: true, advertising, analytics: false },
  };
  cached = record;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(record));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // приватный режим
  }
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  for (const listener of listeners) listener();
  return record;
}

export function resetCookieConsent(): void {
  cached = null;
  try {
    window.localStorage.removeItem(COOKIE_CONSENT_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  for (const listener of listeners) listener();
}

export function subscribeCookieConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCookieConsentSnapshot(): CookieConsentRecord | null {
  return read();
}

export function getServerCookieConsentSnapshot(): undefined {
  return undefined;
}

/** Актуальна ли версия согласия текущей редакции политики. */
export function isCurrentConsent(record: { version: string }): boolean {
  return record.version === COOKIE_CONSENT_VERSION;
}
