/**
 * site-footer.tsx — подвал публичных страниц и юридическая навигация.
 */

import Link from "next/link";

import { brand } from "@/lib/brand";

const product = [
  { href: "/method", label: "Метод" },
  { href: "/science", label: "Наука" },
  { href: "/demo", label: "Демо" },
  { href: "/pricing", label: "Тарифы" },
];

const legal = [
  { href: "/privacy", label: "Политика обработки персональных данных" },
  {
    href: "/privacy-protection",
    label: "Политика в отношении обработки и защиты персональных данных",
  },
  { href: "/consent-pd", label: "Согласие на обработку ПДн" },
  { href: "/cookies", label: "Политика cookie" },
  { href: "/terms", label: "Пользовательское соглашение" },
  { href: "/offer", label: "Оферта" },
];

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink">
      {children}
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper-warm">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1.8fr]">
          <div className="space-y-3">
            <div>
              <p className="font-serif text-2xl font-semibold text-ink">{brand.name}</p>
              <p className="mt-0.5 text-sm font-medium text-primary">{brand.slogan}</p>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted">{brand.explainer}</p>
            <p className="text-xs font-semibold text-muted">{brand.promo}</p>
          </div>

          <nav aria-label="Продукт" className="space-y-3 text-sm">
            <FooterHeading>Продукт</FooterHeading>
            <ul className="space-y-2">
              {product.map((item) => (
                <li key={item.href}>
                  <Link
                    className="text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Документы" className="space-y-3 text-sm">
            <FooterHeading>Документы</FooterHeading>
            <ul className="space-y-2">
              {legal.map((item) => (
                <li key={item.href}>
                  <Link
                    className="text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            {brand.name}. Иллюстрации созданы для проекта.
          </p>
          <p>
            © {brand.domain}
          </p>
        </div>
      </div>
    </footer>
  );
}
