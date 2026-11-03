/**
 * route.ts — webhook ЮKassa.
 *
 * Публичный endpoint без сессии. Доверяет только статусу платежа, а не телу
 * запроса от клиента. Повторная доставка идемпотентна.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { applyProviderPaymentStatus } from "@/lib/billing/service";


const eventSchema = z.object({
  event: z.string(),
  object: z.object({
    id: z.string().min(1),
    status: z.string(),
  }),
});

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    ""
  );
}

export async function POST(request: Request) {
  const trusted = (process.env.YOOKASSA_TRUSTED_IPS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (trusted.length > 0 && !trusted.includes(clientIp(request))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const { event, object } = parsed.data;
  try {
    if (event === "payment.succeeded" || event === "payment.canceled") {
      await applyProviderPaymentStatus(object.id, object.status);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[billing:webhook]", error);
    return NextResponse.json({ error: "WEBHOOK_FAILED" }, { status: 500 });
  }
}
