/**
 * layout.tsx — корневой layout Association Web.
 *
 * Подключает провайдеры, глобальные стили и SEO-метаданные. Шапка и подвал
 * добавляются только в группе публичных страниц (marketing).
 */

import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://association.example"),
  title: {
    default: "Association — английские слова через ассоциации",
    template: "%s · Association",
  },
  description:
    "Онлайн-тренажёр английских слов: русские созвучные ассоциации, книжные иллюстрации и интервальное повторение FSRS.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Association",
    title: "Association — английские слова через ассоциации",
    description:
      "Запоминайте английские слова через живые ассоциации и возвращайтесь к ним по FSRS.",
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
      </body>
    </html>
  );
}
