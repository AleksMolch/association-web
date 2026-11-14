/**
 * cookie-consent-sync.ts — отправка согласия на сервер для авторизованных.
 */

import type { CookieConsentRecord } from "@/lib/cookie-consent";

export async function pushCookieConsentToServer(record: CookieConsentRecord): Promise<boolean> {
  try {
    const response = await fetch("/api/privacy/cookie-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: record.version,
        necessary: record.categories.necessary,
        advertising: record.categories.advertising,
        analytics: record.categories.analytics,
        source: record.source,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
