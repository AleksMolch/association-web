/**
 * page.tsx — согласие на обработку персональных данных.
 */

import type { Metadata } from "next";

import { LegalMarkdown } from "@/components/legal/legal-markdown";

export const metadata: Metadata = {
  title: "Согласие на обработку персональных данных",
  robots: { index: false, follow: true },
};

export default function ConsentPdPage() {
  return <LegalMarkdown file="soglasie_na_obrabotku_personalnyh_dannyh.md" />;
}
