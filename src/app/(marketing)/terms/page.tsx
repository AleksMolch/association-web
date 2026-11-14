/**
 * page.tsx — пользовательское соглашение сервиса «Мнемослов».
 */

import type { Metadata } from "next";

import { LegalMarkdown } from "@/components/legal/legal-markdown";

export const metadata: Metadata = {
  title: "Пользовательское соглашение",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return <LegalMarkdown file="polzovatelskoe_soglashenie.md" />;
}
