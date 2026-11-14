"use client";

/**
 * yandex-autoplacement.tsx — Yandex Autoplacement.
 *
 * Скрипты загружаются только на информационных страницах, только после
 * согласия «Принять все cookies» и только для пользователей без активного
 * VIP. Пока статус подписки неизвестен, реклама не загружается.
 */

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  getCookieConsentSnapshot,
  getServerCookieConsentSnapshot,
  isCurrentConsent,
  subscribeCookieConsent,
} from "@/lib/cookie-consent";
import { useVipStatus } from "@/lib/use-vip-status";

const AD_PAGES = new Set(["/method", "/science"]);
const PAGE_ID = "20420659";

type ConsentLike = { version: string; categories: { advertising: boolean } };

/** Проверяет, разрешена ли реклама на странице при текущем состоянии. */
export function shouldLoadAds(
  pathname: string,
  consent: ConsentLike | null | undefined,
  vip: { vipActive: boolean; vipLoading: boolean },
): boolean {
  if (!AD_PAGES.has(pathname)) return false;
  if (vip.vipActive || vip.vipLoading) return false;
  if (!consent || !isCurrentConsent(consent)) return false;
  return consent.categories.advertising === true;
}

export function YandexAutoplacement() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(
    subscribeCookieConsent,
    getCookieConsentSnapshot,
    getServerCookieConsentSnapshot,
  );
  const vip = useVipStatus();

  if (!shouldLoadAds(pathname, consent, vip)) return null;

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
