"use client";

/**
 * cookie-notice.tsx — баннер согласия на cookie и рекламу.
 *
 * Пока согласие не выбрано (или версия политики изменилась), баннер виден.
 * Рекламные скрипты не загружаются до нажатия «Принять все cookies».
 */

import { useSyncExternalStore } from "react";
import Link from "next/link";

import { useSession } from "@/lib/auth-client";
import {
  getCookieConsentSnapshot,
  getServerCookieConsentSnapshot,
  isCurrentConsent,
  setCookieConsent,
  subscribeCookieConsent,
} from "@/lib/cookie-consent";
import { pushCookieConsentToServer } from "@/lib/cookie-consent-sync";

export function CookieNotice() {
  const { data } = useSession();
  const record = useSyncExternalStore(
    subscribeCookieConsent,
    getCookieConsentSnapshot,
    getServerCookieConsentSnapshot,
  );

  if (record && isCurrentConsent(record)) return null;

  const choose = (advertising: boolean) => {
    const saved = setCookieConsent(advertising, "banner");
    if (data?.user) {
      void pushCookieConsentToServer(saved);
    }
  };

  return (
    <aside
      aria-label="Настройки cookie"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-surface p-4 shadow-lg sm:left-auto sm:right-6 sm:bottom-6"
    >
      <p className="text-sm leading-relaxed text-ink">
        Необходимые cookie нужны для входа и сохранения прогресса. «Принять все
        cookies» разрешает также рекламные cookie и показ рекламы Яндекса. Без
        вашего согласия рекламные скрипты не загружаются. Подробнее — в{" "}
        <Link href="/cookies" className="font-medium text-primary underline underline-offset-2">
          Политике
        </Link>
        .
      </p>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => choose(false)}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-paper-warm"
        >
          Только необходимые
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast hover:bg-primary-hover"
        >
          Принять все cookies
        </button>
      </div>
    </aside>
  );
}
