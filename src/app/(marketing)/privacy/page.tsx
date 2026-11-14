/**
 * page.tsx — политика в отношении обработки персональных данных.
 */

import type { Metadata } from "next";

import { LegalMarkdown } from "@/components/legal/legal-markdown";

export const metadata: Metadata = {
  title: "Политика в отношении обработки персональных данных",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return <LegalMarkdown file="politika_obrabotki_personalnyh_dannyh.md" />;
}
