/**
 * site-header.tsx — шапка публичных страниц.
 *
 * Содержит основную навигацию и CTA. Не показывает состояние авторизации,
 * чтобы публичные страницы оставались статическими; личный кабинет имеет
 * собственную навигацию.
 */

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/method", label: "Метод" },
  { href: "/science", label: "Наука" },
  { href: "/demo", label: "Демо" },
  { href: "/pricing", label: "Тарифы" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="font-serif text-xl font-semibold tracking-tight text-ink"
          aria-label="Association — на главную"
        >
          Association
        </Link>
        <nav aria-label="Основная навигация" className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-primary-soft hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Войти
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            Начать бесплатно
          </Link>
        </div>
      </div>
    </header>
  );
}
