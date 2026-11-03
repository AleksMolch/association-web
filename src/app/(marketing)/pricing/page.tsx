/**
 * page.tsx — страница тарифов.
 *
 * Сравнивает бесплатный доступ и VIP, показывает планы 1/3/6 месяцев.
 * Оплата настраивается через ЮKassa; до подключения магазина кнопки ведут в
 * кабинет и не создают реальный платёж.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRub, plans } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Тарифы",
  description:
    "Бесплатный веб-тренажёр и VIP-доступ Association: без рекламы, синхронизация с мобильным приложением, расширенная статистика и экспорт.",
  alternates: { canonical: "/pricing" },
};

const features = [
  { label: "Веб-тренажёр и FSRS", free: true, vip: true },
  { label: "Выбранные ассоциации", free: true, vip: true },
  { label: "Базовая статистика", free: true, vip: true },
  { label: "Без рекламы", free: false, vip: true },
  { label: "Синхронизация с мобильным", free: false, vip: true },
  { label: "Расширенная статистика", free: false, vip: true },
  { label: "Экспорт данных", free: false, vip: true },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
      <div className="max-w-3xl space-y-4">
        <Badge variant="primary">Тарифы</Badge>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Практика бесплатна. VIP — для облака и деталей
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          Регистрация и веб-прогресс бесплатны. VIP убирает рекламу и открывает
          межплатформенную синхронизацию, расширенную статистику и экспорт.
        </p>
      </div>

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.code} className={plan.highlight ? "border-primary" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{plan.title}</CardTitle>
                {plan.highlight ? <Badge variant="primary">Оптимально</Badge> : null}
              </div>
              <p className="font-serif text-3xl font-semibold text-ink">{formatRub(plan.amountMinor)}</p>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <Link
              href={`/register?next=${encodeURIComponent(`/dashboard/billing?plan=${plan.code}`)}`}
              className={buttonVariants({ variant: plan.highlight ? "primary" : "secondary", className: "w-full" })}
            >
              Выбрать тариф
            </Link>
            <p className="mt-2 text-center text-xs text-muted">
              Оплата через ЮKassa. Автопродление подключается отдельно.
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Сравнение бесплатного и VIP-доступа</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="p-4 font-semibold text-ink">Возможность</th>
              <th scope="col" className="p-4 font-semibold text-ink">Бесплатно</th>
              <th scope="col" className="p-4 font-semibold text-ink">VIP</th>
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr key={feature.label} className="border-b border-line last:border-0">
                <th scope="row" className="p-4 text-left font-medium text-ink">{feature.label}</th>
                <td className="p-4 text-muted">
                  {feature.free ? (
                    <Check className="size-4 text-success" aria-label="Да" />
                  ) : (
                    <Minus className="size-4" aria-label="Нет" />
                  )}
                </td>
                <td className="p-4 text-muted">
                  {feature.vip ? (
                    <Check className="size-4 text-success" aria-label="Да" />
                  ) : (
                    <Minus className="size-4" aria-label="Нет" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 space-y-2 text-sm leading-relaxed text-muted">
        <p>
          Цены и состав тарифов — пример для разработки. Перед запуском их нужно
          синхронизировать с офертой, чеками 54-ФЗ и тестовым магазином ЮKassa.
        </p>
        <p>
          Возврат, автопродление и рекуррентные списания описаны в оферте и требуют
          юридической проверки. Оплата не активирует VIP по return URL: только
          подтверждённый webhook.
        </p>
      </div>
    </div>
  );
}
