/**
 * service.ts — бизнес-логика подписок и платежей.
 *
 * Оплата подтверждается только webhook-ом ЮKassa. Сумма и срок берутся из
 * тарифа; клиент не может их подменить. Повторный webhook идемпотентен.
 */

import { and, desc, eq, gt, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { auditLog, payments, subscriptions } from "@/lib/db/schema";
import { getPlan } from "@/lib/billing/plans";
import { createYooKassaPayment } from "@/lib/billing/yookassa";

export type BillingOverview = {
  subscription: {
    id: string;
    planId: string;
    status: string;
    startsAt: string;
    endsAt: string;
  } | null;
  payments: {
    id: string;
    planId: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }[];
};

export async function getActiveSubscription(userId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"), gt(subscriptions.endsAt, new Date())))
    .orderBy(desc(subscriptions.endsAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function hasVip(userId: string): Promise<boolean> {
  return Boolean(await getActiveSubscription(userId));
}

export async function getBillingOverview(userId: string): Promise<BillingOverview> {
  const [active, paymentRows] = await Promise.all([
    getActiveSubscription(userId),
    db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).limit(20),
  ]);
  return {
    subscription: active
      ? {
          id: active.id,
          planId: active.planId,
          status: active.status,
          startsAt: active.startsAt.toISOString(),
          endsAt: active.endsAt.toISOString(),
        }
      : null,
    payments: paymentRows.map((row) => ({
      id: row.id,
      planId: row.planId,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

export async function createSubscriptionPayment(input: {
  userId: string;
  email: string;
  planCode: string;
  returnUrl: string;
}): Promise<{ paymentId: string; confirmationUrl: string }> {
  const plan = getPlan(input.planCode);
  if (!plan) throw new Error("Неизвестный тариф");

  const paymentId = crypto.randomUUID();
  const idempotenceKey = crypto.randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnUrl = new URL(input.returnUrl || `${appUrl}/dashboard/billing/return`);
  returnUrl.searchParams.set("paymentId", paymentId);

  await db.insert(payments).values({
    id: paymentId,
    userId: input.userId,
    planId: plan.code,
    amount: plan.amountMinor,
    currency: plan.currency,
    status: "pending",
    idempotenceKey,
  });

  try {
    const remote = await createYooKassaPayment({
      amountMinor: plan.amountMinor,
      description: `Association VIP — ${plan.title}`,
      returnUrl: returnUrl.toString(),
      idempotenceKey,
      metadata: { paymentId, userId: input.userId, planId: plan.code },
      customerEmail: input.email,
    });
    const confirmationUrl = remote.confirmation?.confirmation_url;
    if (!confirmationUrl) throw new Error("ЮKassa не вернула ссылку на оплату");

    await db
      .update(payments)
      .set({ providerPaymentId: remote.id, confirmationUrl, updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    return { paymentId, confirmationUrl };
  } catch (error) {
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payments.id, paymentId));
    throw error;
  }
}

export async function applyProviderPaymentStatus(providerPaymentId: string, status: string): Promise<void> {
  const rows = await db.select().from(payments).where(eq(payments.providerPaymentId, providerPaymentId)).limit(1);
  const payment = rows[0];
  if (!payment) return;

  if (status === "canceled") {
    await db
      .update(payments)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(payments.id, payment.id), ne(payments.status, "succeeded")));
    return;
  }

  if (status !== "succeeded") return;

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(payments)
      .set({ status: "succeeded", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(payments.id, payment.id), ne(payments.status, "succeeded")))
      .returning({ id: payments.id });

    if (claimed.length === 0) return;

    const plan = getPlan(payment.planId);
    if (!plan) return;

    const currentRows = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, payment.userId), eq(subscriptions.status, "active"), gt(subscriptions.endsAt, new Date())))
      .orderBy(desc(subscriptions.endsAt))
      .limit(1);
    const current = currentRows[0];
    const startsAt = current && current.endsAt > new Date() ? current.endsAt : new Date();
    const endsAt = addMonths(startsAt, plan.durationMonths);

    await tx.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId: payment.userId,
      planId: plan.code,
      status: "active",
      startsAt,
      endsAt,
      paymentId: payment.id,
      updatedAt: new Date(),
    });

    await tx.insert(auditLog).values({
      id: crypto.randomUUID(),
      actorId: payment.userId,
      action: "subscription.activated",
      targetType: "payment",
      targetId: payment.id,
      meta: { planId: plan.code, endsAt: endsAt.toISOString() },
    });
  });
}
