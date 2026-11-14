"use client";

/**
 * cookie-notice.tsx — уведомление об обязательных cookie.
 *
 * Сайт использует только необходимые cookie Better Auth и localStorage для
 * прогресса; аналитики и рекламы сейчас нет. Уведомление можно закрыть,
 * решение хранится локально.
 */

import { useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEY = "mnemoslov_cookie_notice_v1";
const listeners = new Set<() => void>();
let dismissed = false;
let initialized = false;

function readDismissed(): boolean {
  if (!initialized && typeof window !== "undefined") {
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    initialized = true;
  }
  return dismissed;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return readDismissed();
}

function getServerSnapshot(): boolean {
  return true;
}

function dismiss(): void {
  dismissed = true;
  initialized = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // приватный режим: уведомление просто появится снова
  }
  for (const listener of listeners) listener();
}

export function CookieNotice() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (hidden) return null;

  return (
    <aside
      aria-label="Уведомление о cookie"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-surface p-4 shadow-lg sm:left-auto sm:right-6 sm:bottom-6"
    >
      <p className="text-sm leading-relaxed text-ink">
        Мы используем только необходимые cookie для входа и сохранения прогресса.
        Аналитики и рекламы на сайте сейчас нет.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Link href="/privacy#cookies" className="text-xs font-medium text-primary underline underline-offset-2">
          Подробнее в Политике
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast hover:bg-primary-hover"
        >
          Понятно
        </button>
      </div>
    </aside>
  );
}
