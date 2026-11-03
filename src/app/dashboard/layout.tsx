/**
 * layout.tsx — каркас личного кабинета.
 *
 * Верхняя навигация для гостя и будущего авторизованного пользователя.
 * Прогресс гостя хранится локально; после входа его можно синхронизировать.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { AccountMenu } from "@/components/dashboard/account-menu";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const links = [
  { href: "/dashboard", label: "Обзор" },
  { href: "/dashboard/words", label: "Слова" },
  { href: "/dashboard/progress", label: "Прогресс" },
  { href: "/dashboard/settings", label: "Настройки" },
  { href: "/dashboard/billing", label: "VIP" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link href="/dashboard" className="font-serif text-xl font-semibold text-ink">
            Association
          </Link>
          <nav aria-label="Кабинет" className="order-3 flex w-full gap-1 overflow-x-auto md:order-2 md:w-auto">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-primary-soft hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="order-2 flex items-center gap-1.5 md:order-3">
            <AccountMenu />
            <Link href="/train" className={buttonVariants({ size: "sm" })}>Занятие</Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
        {children}
      </main>
    </>
  );
}
