"use client";

/**
 * page.tsx — VIP-подписка и платежи.
 *
 * Сумма определяется на сервере по коду тарифа. После создания платежа
 * пользователь уходит на страницу ЮKassa; VIP активируется только webhook-ом.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CreditCard, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRub, plans } from "@/lib/billing/plans";
import { useSession } from "@/lib/auth-client";

type Overview = {
  subscription: { id: string; planId: string; status: string; startsAt: string; endsAt: string } | null;
  payments: { id: string; planId: string; amount: number; currency: string; status: string; createdAt: string }[];
};

export default function BillingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    fetch("/api/billing/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Overview | null) => {
        if (cancelled) return;
        if (data) setOverview(data);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  async function pay(planCode: string) {
    setPendingPlan(planCode);
    try {
      const response = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode,
          returnUrl: `${window.location.origin}/dashboard/billing/return`,
        }),
      });
      const data = (await response.json().catch(() => null)) as { confirmationUrl?: string; error?: string } | null;
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.status === 503) {
        setNotConfigured(true);
        toast.error("ЮKassa ещё не настроена. Добавьте ключи магазина.");
        return;
      }
      if (!response.ok || !data?.confirmationUrl) {
        toast.error("Не удалось создать платёж. Попробуйте позже.");
        return;
      }
      window.location.assign(data.confirmationUrl);
    } catch {
      toast.error("Не удалось связаться с сервером.");
    } finally {
      setPendingPlan(null);
    }
  }

  const active = overview?.subscription ?? null;
  const loading = isPending || (Boolean(session?.user) && !overview && !failed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Подписка</p>
          <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">VIP</h1>
        </div>
        <Badge variant={active ? "primary" : "outline"}>{active ? "Активен" : "Бесплатный доступ"}</Badge>
      </div>

      {isPending ? <Card><p className="text-sm text-muted">Проверяем сессию…</p></Card> : null}

      {active ? (
        <Card className="border-primary/40 bg-primary-soft/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> VIP активен
            </CardTitle>
            <CardDescription>
              Тариф {plans.find((plan) => plan.code === active.planId)?.title ?? active.planId} действует до{" "}
              {new Date(active.endsAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}.
            </CardDescription>
          </CardHeader>
          <p className="text-sm text-muted">
            Продление добавляет срок к текущей дате окончания. Автосписание пока не
            подключено: продление выполняется вручную.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isActive = active?.planId === plan.code;
          return (
            <Card key={plan.code} className={plan.highlight ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{plan.title}</CardTitle>
                  {plan.highlight ? <Badge variant="primary">Оптимально</Badge> : null}
                </div>
                <p className="font-serif text-3xl font-semibold text-ink">{formatRub(plan.amountMinor)}</p>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <ul className="mb-4 space-y-1.5 text-sm text-muted">
                {["Без рекламы", "Облачная синхронизация", "Расширенная статистика", "Экспорт данных"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-3.5 text-success" aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
              {!session?.user ? (
                <Link href="/register" className={buttonVariants({ variant: plan.highlight ? "primary" : "secondary", className: "w-full" })}>
                  Войти и оформить
                </Link>
              ) : (
                <Button
                  variant={isActive ? "secondary" : plan.highlight ? "primary" : "secondary"}
                  className="w-full"
                  disabled={pendingPlan !== null}
                  onClick={() => pay(plan.code)}
                >
                  <CreditCard className="size-4" aria-hidden="true" />
                  {pendingPlan === plan.code ? "Создаём платёж…" : isActive ? "Продлить" : "Оплатить"}
                </Button>
              )}
              <p className="mt-2 text-center text-xs text-muted">Оплата через ЮKassa</p>
            </Card>
          );
        })}
      </div>

      {notConfigured ? (
        <Card className="border-coral/30">
          <p className="text-sm text-muted">
            Платёжный магазин ещё не подключён. Для тестирования задайте
            YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY и URL webhook в окружении.
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>История платежей</CardTitle>
          <CardDescription>Последние 20 попыток. VIP активирует только успешный webhook.</CardDescription>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-muted">Загружаем…</p>
        ) : failed ? (
          <p className="text-sm text-muted">Не удалось загрузить платежи. Проверьте подключение к БД.</p>
        ) : !overview || overview.payments.length === 0 ? (
          <p className="text-sm text-muted">Платежей пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Дата</th>
                  <th className="py-2 pr-3 font-medium">Тариф</th>
                  <th className="py-2 pr-3 font-medium">Сумма</th>
                  <th className="py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {overview.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-muted">{new Date(payment.createdAt).toLocaleDateString("ru-RU")}</td>
                    <td className="py-2 pr-3 text-ink">{payment.planId}</td>
                    <td className="py-2 pr-3 text-ink">{formatRub(payment.amount)}</td>
                    <td className="py-2 text-muted">{payment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/offer" className={buttonVariants({ variant: "ghost", size: "sm" })}>Оферта</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>В кабинет</Link>
      </div>
    </div>
  );
}
