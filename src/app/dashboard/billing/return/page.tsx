"use client";

/**
 * page.tsx — возврат со страницы ЮKassa.
 *
 * Статус читается с сервера; страница не доверяет query-параметрам как
 * подтверждению оплаты и не активирует VIP.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PaymentState = {
  payment: { id: string; status: string; planId: string } | null;
  subscription: { endsAt: string } | null;
};

function ReturnContent() {
  const params = useSearchParams();
  const paymentId = params.get("paymentId");
  const [state, setState] = useState<PaymentState | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!paymentId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const response = await fetch(`/api/billing/status?paymentId=${encodeURIComponent(paymentId)}`, { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as PaymentState;
          if (!cancelled) setState(data);
          if (data.payment?.status === "succeeded" || data.payment?.status === "canceled") return;
        }
      } catch {
        // сеть может быть недоступна сразу после возврата
      }
      if (!cancelled) {
        setAttempts((previous) => previous + 1);
        timer = setTimeout(load, 2500);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId]);

  if (!paymentId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Платёж не найден</CardTitle>
          <CardDescription>В ссылке нет идентификатора платежа.</CardDescription>
        </CardHeader>
        <Link href="/dashboard/billing" className={buttonVariants()}>К тарифам</Link>
      </Card>
    );
  }

  const status = state?.payment?.status;
  if (status === "succeeded") {
    return (
      <Card className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
        <CardHeader className="mt-3">
          <CardTitle>Оплата подтверждена</CardTitle>
          <CardDescription>
            VIP активирован. Срок действия: {state?.subscription ? new Date(state.subscription.endsAt).toLocaleDateString("ru-RU") : "обновляется"}.
          </CardDescription>
        </CardHeader>
        <Link href="/dashboard" className={buttonVariants()}>В кабинет</Link>
      </Card>
    );
  }

  if (status === "canceled") {
    return (
      <Card className="text-center">
        <XCircle className="mx-auto size-12 text-coral" aria-hidden="true" />
        <CardHeader className="mt-3">
          <CardTitle>Платёж отменён</CardTitle>
          <CardDescription>Деньги не списаны. Можно выбрать тариф заново.</CardDescription>
        </CardHeader>
        <Link href="/dashboard/billing" className={buttonVariants()}>К тарифам</Link>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <Clock3 className="mx-auto size-12 text-warning" aria-hidden="true" />
      <CardHeader className="mt-3">
        <CardTitle>Проверяем оплату</CardTitle>
        <CardDescription>
          Обычно это занимает несколько секунд. Не закрывайте страницу; если
          статус не обновился, вернитесь в тарифы позже.
        </CardDescription>
      </CardHeader>
      {attempts > 8 ? (
        <p className="text-xs text-muted">Webhook ещё не пришёл. VIP активируется автоматически после подтверждения.</p>
      ) : null}
      <Link href="/dashboard/billing" className={buttonVariants({ variant: "secondary", className: "mt-4" })}>
        Вернуться к тарифам
      </Link>
    </Card>
  );
}

export default function BillingReturnPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Suspense fallback={<Card><p className="text-sm text-muted">Загружаем статус…</p></Card>}>
        <ReturnContent />
      </Suspense>
    </div>
  );
}
