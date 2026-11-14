/**
 * page.tsx — политика использования файлов cookie и аналогичных технологий.
 */

import type { Metadata } from "next";

import { CookieSettings } from "@/components/cookie-settings";
import { LegalMarkdown } from "@/components/legal/legal-markdown";

export const metadata: Metadata = {
  title: "Политика использования cookie",
  robots: { index: false, follow: true },
};

export default function CookiesPage() {
  return (
    <>
      <div id="settings" className="mx-auto w-full max-w-3xl px-5 pt-10 sm:px-8">
        <CookieSettings />
      </div>
      <LegalMarkdown file="politika_cookie.md" />
    </>
  );
}
