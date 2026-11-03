/**
 * route.ts — состояние подписки и платежей авторизованного пользователя.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { getBillingOverview } from "@/lib/billing/service";
import { getServerSession } from "@/lib/server/session";


export async function GET(request: Request) {
  const session = await getServerSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const paymentId = new URL(request.url).searchParams.get("paymentId");
  try {
    const overview = await getBillingOverview(session.user.id);
    if (!paymentId) return NextResponse.json(overview);

    const rows = await db
      .select({ id: payments.id, status: payments.status, planId: payments.planId })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.userId, session.user.id)))
      .limit(1);

    return NextResponse.json({ ...overview, payment: rows[0] ?? null });
  } catch (error) {
    console.error("[billing:status]", error);
    return NextResponse.json({ error: "BILLING_UNAVAILABLE" }, { status: 503 });
  }
}
