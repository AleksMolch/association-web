/**
 * page.tsx — политика в отношении обработки и защиты персональных данных.
 *
 * Дублирует содержимое политики обработки ПДн, отличаясь только заголовком.
 */

import type { Metadata } from "next";

import { LegalMarkdown } from "@/components/legal/legal-markdown";

export const metadata: Metadata = {
  title: "Политика в отношении обработки и защиты персональных данных",
  robots: { index: false, follow: true },
};

export default function PrivacyProtectionPage() {
  return (
    <LegalMarkdown
      file="politika_obrabotki_personalnyh_dannyh.md"
      heading="Политика в отношении обработки и защиты персональных данных"
    />
  );
}
