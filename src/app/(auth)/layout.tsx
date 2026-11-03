/**
 * layout.tsx — каркас страниц авторизации.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="font-serif text-xl font-semibold text-ink">Association</Link>
        <Link href="/" className="text-sm font-medium text-muted hover:text-ink">На главную</Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-5 py-8 sm:py-14">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-5 pb-6 text-xs text-muted sm:px-8">
        Association ·{" "}
        <Link href="/privacy" className="hover:text-ink">Конфиденциальность</Link> ·{" "}
        <Link href="/terms" className="hover:text-ink">Условия</Link>
      </footer>
    </div>
  );
}
