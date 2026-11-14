/**
 * cookie-consent.ts — согласие на рекламные cookie.
 *
 * «Только необходимые» не загружает рекламные скрипты. «Разрешить рекламу»
 * разрешает Yandex Autoplacement на информационных страницах.
 */

export type CookieConsent = "all" | "necessary";

export const COOKIE_CONSENT_KEY = "mnemoslov_cookie_consent_v1";
export const COOKIE_CONSENT_EVENT = "mnemoslov-cookie-consent-change";

let cached: CookieConsent | null | undefined;
const listeners = new Set<() => void>();

function read(): CookieConsent | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    cached = raw === "all" || raw === "necessary" ? raw : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function setCookieConsent(value: CookieConsent): void {
  cached = value;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    // приватный режим
  }
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  for (const listener of listeners) listener();
}

export function resetCookieConsent(): void {
  cached = null;
  try {
    window.localStorage.removeItem(COOKIE_CONSENT_KEY);
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

export function getCookieConsentSnapshot(): CookieConsent | null {
  return read();
}

export function getServerCookieConsentSnapshot(): undefined {
  return undefined;
}
