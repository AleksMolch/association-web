"use client";

/**
 * cookie-settings.tsx — настройка и отзыв cookie-согласия.
 *
 * Позволяет сменить выбор, отозвать согласие на рекламные cookie и увидеть
 * версию/дату решения.
 */

import { useSyncExternalStore } from "react";

import { useSession } from "@/lib/auth-client";
import {
  COOKIE_CONSENT_VERSION,
  getCookieConsentSnapshot,
  getServerCookieConsentSnapshot,
  isCurrentConsent,
  setCookieConsent,
  subscribeCookieConsent,
} from "@/lib/cookie-consent";
import { pushCookieConsentToServer } from "@/lib/cookie-consent-sync";

export function CookieSettings() {
  const { data } = useSession();
  const record = useSyncExternalStore(
    subscribeCookieConsent,
    getCookieConsentSnapshot,
    getServerCookieConsentSnapshot,
  );

  const advertising = Boolean(record?.categories.advertising);
  const decidedAt = record?.decidedAt ? new Date(record.decidedAt).toLocaleString("ru-RU") : null;

  const choose = (value: boolean) => {
    const saved = setCookieConsent(value, "settings");
    if (data?.user) void pushCookieConsentToServer(saved);
    // Перезагрузка гарантированно убирает/добавляет рекламные скрипты.
    if (!value) window.location.reload();
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-serif text-xl font-semibold text-ink">Настройки cookie</h2>
      <p className="mt-1 text-sm text-muted">
        Текущий выбор:{" "}
        <strong className="text-ink">{advertising ? "Рекламные cookie разрешены" : "Только необходимые"}</strong>
      </p>
      <p className="mt-1 text-xs text-muted">
        Версия согласия: {record?.version ?? "не выбрана"}
        {decidedAt ? ` · решено ${decidedAt}` : ""}. Текущая версия политики: {COOKIE_CONSENT_VERSION}.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => choose(false)}
          className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
            record && isCurrentConsent(record) && !advertising
              ? "border-primary bg-primary-soft text-primary"
              : "border-line bg-surface text-ink hover:bg-paper-warm"
          }`}
        >
          Только необходимые
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
            advertising ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink hover:bg-paper-warm"
          }`}
        >
          Принять все cookies
        </button>
      </div>
      {advertising ? (
        <button
          type="button"
          onClick={() => choose(false)}
          className="mt-2 text-xs font-medium text-coral underline underline-offset-2"
        >
          Отозвать согласие на рекламные cookie
        </button>
      ) : null}
    </div>
  );
}
