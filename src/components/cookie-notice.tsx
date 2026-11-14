"use client";

/**
 * cookie-notice.tsx — согласие на необходимые и рекламные cookie.
 *
 * Пока согласие не выбрано, рекламные скрипты не загружаются. «Только
 * необходимые» оставляет только вход и локальный прогресс.
 */

import { useSyncExternalStore } from "react";
import Link from "next/link";

import {
  getCookieConsentSnapshot,
  getServerCookieConsentSnapshot,
  setCookieConsent,
  subscribeCookieConsent,
} from "@/lib/cookie-consent";

export function CookieNotice() {
  const consent = useSyncExternalStore(
    subscribeCookieConsent,
    getCookieConsentSnapshot,
    getServerCookieConsentSnapshot,
  );

  if (consent !== null) return null;

  return (
    <aside
      aria-label="Настройки cookie"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-surface p-4 shadow-lg sm:left-auto sm:right-6 sm:bottom-6"
    >
      <p className="text-sm leading-relaxed text-ink">
        Мы используем необходимые cookie для входа и прогресса. С вашего согласия
        также загружаются рекламные технологии Яндекса на информационных страницах.
        Подробнее — в{" "}
        <Link href="/privacy#cookies" className="font-medium text-primary underline underline-offset-2">
          Политике
        </Link>
        .
      </p>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setCookieConsent("necessary")}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-paper-warm"
        >
          Только необходимые
        </button>
        <button
          type="button"
          onClick={() => setCookieConsent("all")}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast hover:bg-primary-hover"
        >
          Разрешить рекламу
        </button>
      </div>
    </aside>
  );
}
