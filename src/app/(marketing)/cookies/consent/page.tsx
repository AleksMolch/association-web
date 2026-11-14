/**
 * page.tsx — согласие на необязательные cookie и рекламные технологии Yandex.
 */

import type { Metadata } from "next";

import { LegalMarkdown } from "@/components/legal/legal-markdown";

export const metadata: Metadata = {
  title: "Согласие на использование cookie",
  robots: { index: false, follow: true },
};

export default function CookieConsentPage() {
  return <LegalMarkdown file="soglasie_cookie_yandex.md" />;
}
