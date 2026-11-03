/**
 * route.ts — создание платежа ЮKassa для авторизованного пользователя.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { createSubscriptionPayment } from "@/lib/billing/service";
import { BillingConfigError } from "@/lib/billing/yookassa";
import { getServerSession } from "@/lib/server/session";


const bodySchema = z.object({
  planCode: z.enum(["1m", "3m", "6m"]),
  returnUrl: z.string().url().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const fallbackReturn = `${appUrl}/dashboard/billing/return`;
  let returnUrl = fallbackReturn;
  if (parsed.data.returnUrl) {
    try {
      const candidate = new URL(parsed.data.returnUrl);
      if (candidate.origin === new URL(appUrl).origin) returnUrl = candidate.toString();
    } catch {
      return NextResponse.json({ error: "INVALID_RETURN_URL" }, { status: 400 });
    }
  }

  try {
    const result = await createSubscriptionPayment({
      userId: session.user.id,
      email: session.user.email,
      planCode: parsed.data.planCode,
      returnUrl,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BillingConfigError) {
      return NextResponse.json({ error: "BILLING_NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("[billing:create-payment]", error);
    return NextResponse.json({ error: "PAYMENT_FAILED" }, { status: 502 });
  }
}
