/**
 * yookassa.ts — минимальный серверный клиент ЮKassa API v3.
 *
 * Секреты читаются только на сервере. Клиент не передаёт сумму: она берётся
 * из тарифа в plans.ts.
 */

const API_URL = process.env.YOOKASSA_API_URL ?? "https://api.yookassa.ru/v3";

export class BillingConfigError extends Error {}

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new BillingConfigError("ЮKassa не настроена");
  return `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`;
}

export type YooKassaPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  confirmation?: { type: string; confirmation_url?: string };
  amount: { value: string; currency: string };
  metadata?: Record<string, string>;
};

export async function createYooKassaPayment(input: {
  amountMinor: number;
  description: string;
  returnUrl: string;
  idempotenceKey: string;
  metadata: Record<string, string>;
  customerEmail: string;
}): Promise<YooKassaPayment> {
  const response = await fetch(`${API_URL}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: (input.amountMinor / 100).toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description,
      metadata: { ...input.metadata, customerEmail: input.customerEmail },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[yookassa] create payment failed", response.status, detail.slice(0, 300));
    throw new Error("Не удалось создать платёж");
  }

  return (await response.json()) as YooKassaPayment;
}

export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment | null> {
  const response = await fetch(`${API_URL}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Не удалось получить платёж");
  return (await response.json()) as YooKassaPayment;
}
