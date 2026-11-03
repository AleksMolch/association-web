/**
 * site-footer.tsx — подвал публичных страниц и юридическая навигация.
 */

import Link from "next/link";

const legal = [
  { href: "/privacy", label: "Политика ПД" },
  { href: "/terms", label: "Пользовательское соглашение" },
  { href: "/offer", label: "Оферта" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper-warm">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-2">
          <p className="font-serif text-xl font-semibold text-ink">Association</p>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Английские слова через русские созвучные ассоциации, книжные иллюстрации и
            интервальное повторение. Не является медицинской или научной гарантией
            результата.
          </p>
        </div>
        <nav aria-label="Продукт" className="space-y-2 text-sm">
          <p className="font-semibold text-ink">Продукт</p>
          <Link className="block text-muted hover:text-ink" href="/method">Метод</Link>
          <Link className="block text-muted hover:text-ink" href="/science">Наука</Link>
          <Link className="block text-muted hover:text-ink" href="/demo">Демо</Link>
          <Link className="block text-muted hover:text-ink" href="/pricing">Тарифы</Link>
        </nav>
        <nav aria-label="Документы" className="space-y-2 text-sm">
          <p className="font-semibold text-ink">Документы</p>
          {legal.map((item) => (
            <Link key={item.href} className="block text-muted hover:text-ink" href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-line px-5 py-4 text-center text-xs text-muted sm:px-8">
        Association. Иллюстрации созданы для проекта.
      </div>
    </footer>
  );
}
