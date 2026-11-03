/**
 * page.tsx — минимальная read-only админка.
 *
 * Доступ только для пользователей с role=admin. Показывает пользователей,
 * платежи и активные подписки. Управление тарифами и контентом — через
 * миграции и повторный деплой, а не через UI.
 */

import Link from "next/link";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { cards, payments, subscriptions, user } from "@/lib/db/schema";
import { formatRub } from "@/lib/billing/plans";
import { getServerSession } from "@/lib/server/session";


export const instant = false;

async function loadAdminData() {
  const [usersCount] = await db.select({ value: count() }).from(user);
  const [cardsCount] = await db.select({ value: count() }).from(cards);
  const [vipCount] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), gt(subscriptions.endsAt, new Date())));
  const [revenue] = await db
    .select({ value: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(eq(payments.status, "succeeded"));
  const recentUsers = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(10);
  const recentPayments = await db
    .select({ id: payments.id, planId: payments.planId, amount: payments.amount, status: payments.status })
    .from(payments)
    .orderBy(desc(payments.createdAt))
    .limit(10);

  return {
    usersCount: usersCount?.value ?? 0,
    cardsCount: cardsCount?.value ?? 0,
    vipCount: vipCount?.value ?? 0,
    revenue: revenue?.value ?? 0,
    recentUsers,
    recentPayments,
  };
}

type AdminData = Awaited<ReturnType<typeof loadAdminData>>;

export default async function AdminPage() {
  const session = await getServerSession().catch(() => undefined);

  if (session === undefined) return <SetupMessage />;
  if (!session) {
    return (
      <Card className="mx-auto mt-16 max-w-lg text-center">
        <CardHeader>
          <CardTitle>Нужен вход</CardTitle>
          <CardDescription>Админка доступна только после авторизации.</CardDescription>
        </CardHeader>
        <Link href="/login" className={buttonVariants()}>Войти</Link>
      </Card>
    );
  }
  if (session.user.role !== "admin") {
    return (
      <Card className="mx-auto mt-16 max-w-lg text-center">
        <CardHeader>
          <CardTitle>Доступ запрещён</CardTitle>
          <CardDescription>У вашей учётной записи нет роли admin.</CardDescription>
        </CardHeader>
        <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>В кабинет</Link>
      </Card>
    );
  }

  const data = await loadAdminData().catch(() => null);
  if (!data) return <SetupMessage />;
  return <AdminView data={data} />;
}

function AdminView({ data }: { data: AdminData }) {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Служебный раздел</p>
          <h1 className="font-serif text-3xl font-semibold text-ink">Админка</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "sm" })}>В кабинет</Link>
          <Badge variant="outline">read-only</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Пользователи", data.usersCount],
          ["Карточки", data.cardsCount],
          ["VIP активен", data.vipCount],
          ["Оплачено", formatRub(data.revenue)],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <p className="text-xs text-muted">{label}</p>
            <p className="font-serif text-2xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Последние пользователи</CardTitle>
            <CardDescription>10 записей.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Имя</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 font-medium">Роль</th>
                </tr>
              </thead>
              <tbody>
                {data.recentUsers.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-ink">{row.name}</td>
                    <td className="py-2 pr-3 text-muted">{row.email}</td>
                    <td className="py-2 text-muted">{row.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Последние платежи</CardTitle>
            <CardDescription>Статус берётся из БД после webhook.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Тариф</th>
                  <th className="py-2 pr-3 font-medium">Сумма</th>
                  <th className="py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-ink">{row.planId}</td>
                    <td className="py-2 pr-3 text-muted">{formatRub(row.amount)}</td>
                    <td className="py-2 text-muted">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}

function SetupMessage() {
  return (
    <main id="main" className="mx-auto mt-16 w-full max-w-lg px-5">
      <Card>
        <CardHeader>
          <CardTitle>База данных не готова</CardTitle>
          <CardDescription>
            Проверьте DATABASE_URL, примените миграции и задайте роль admin
            пользователю. Подробности — в docs/OPERATIONS.md.
          </CardDescription>
        </CardHeader>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>На главную</Link>
      </Card>
    </main>
  );
}
