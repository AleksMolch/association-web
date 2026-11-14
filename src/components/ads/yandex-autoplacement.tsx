"use client";

/**
 * yandex-autoplacement.tsx — Yandex Autoplacement.
 *
 * Скрипты загружаются только на информационных страницах и только после
 * согласия «Разрешить рекламу». На лендинге, в демо, тарифах, auth,
 * кабинете и тренажёре реклама не подключается.
 */

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  getCookieConsentSnapshot,
  getServerCookieConsentSnapshot,
  subscribeCookieConsent,
} from "@/lib/cookie-consent";

const AD_PAGES = new Set(["/method", "/science"]);
const PAGE_ID = "20420659";

/** Проверяет, разрешена ли реклама на странице при текущем согласии. */
export function shouldLoadAds(
  pathname: string,
  consent: "all" | "necessary" | null | undefined,
): boolean {
  return consent === "all" && AD_PAGES.has(pathname);
}

export function YandexAutoplacement() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(
    subscribeCookieConsent,
    getCookieConsentSnapshot,
    getServerCookieConsentSnapshot,
  );

  if (!shouldLoadAds(pathname, consent)) return null;

  return (
    <>
      <Script
        id="yandex-autoplacement-context"
        src="https://yandex.ru/ads/system/context.js"
        strategy="afterInteractive"
      />
      <Script
        id="yandex-autoplacement-loader"
        data-page-id={PAGE_ID}
        src="https://yandex.ru/ads/system/ap-loader.js"
        strategy="afterInteractive"
      />
    </>
  );
}
