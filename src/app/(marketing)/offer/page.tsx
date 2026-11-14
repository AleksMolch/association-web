/**
 * page.tsx — публичная оферта на предоставление VIP-доступа.
 */

import type { Metadata } from "next";

import { LegalMarkdown } from "@/components/legal/legal-markdown";

export const metadata: Metadata = {
  title: "Оферта",
  robots: { index: false, follow: true },
};

export default function OfferPage() {
  return <LegalMarkdown file="oferta_vip_dostup.md" />;
}
