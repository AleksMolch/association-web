/**
 * layout.tsx — корневой layout «Мнемослов».
 *
 * Подключает провайдеры, глобальные стили и SEO-метаданные. Шапка и подвал
 * добавляются только в группе публичных страниц (marketing).
 */

import type { Metadata, Viewport } from "next";

import { CookieNotice } from "@/components/cookie-notice";
import { PdConsentGate } from "@/components/pd-consent-gate";
import { Providers } from "@/components/providers";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? `https://${brand.domain}`),
  title: {
    default: `${brand.name} — английские слова через ассоциации`,
    template: `%s · ${brand.name}`,
  },
  description: brand.positioning,
  applicationName: brand.appName,
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: brand.name,
    title: `${brand.name} — ${brand.explainer}`,
    description: brand.positioning,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f7" },
    { media: "(prefers-color-scheme: dark)", color: "#101515" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
        >
          К основному содержанию
        </a>
        <Providers>{children}</Providers>
        <PdConsentGate />
        <CookieNotice />
      </body>
    </html>
  );
}
