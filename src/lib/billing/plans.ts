/**
 * plans.ts — тарифы VIP-доступа.
 *
 * Цены хранятся в копейках, срок — в календарных месяцах. Эти значения
 * используются лендингом и серверным billing-сервисом; клиент не передаёт цену.
 */

export type PlanCode = "1m" | "3m" | "6m";

export type Plan = {
  code: PlanCode;
  title: string;
  durationMonths: number;
  amountMinor: number;
  currency: "RUB";
  recurringAllowed: boolean;
  description: string;
  highlight?: boolean;
};

export const plans: Plan[] = [
  {
    code: "1m",
    title: "1 месяц",
    durationMonths: 1,
    amountMinor: 29900,
    currency: "RUB",
    recurringAllowed: true,
    description: "Попробовать VIP без долгого обязательства.",
  },
  {
    code: "3m",
    title: "3 месяца",
    durationMonths: 3,
    amountMinor: 79900,
    currency: "RUB",
    recurringAllowed: true,
    description: "Оптимальный вариант для регулярной практики.",
    highlight: true,
  },
  {
    code: "6m",
    title: "6 месяцев",
    durationMonths: 6,
    amountMinor: 149900,
    currency: "RUB",
    recurringAllowed: true,
    description: "Максимальная выгода и спокойный учебный ритм.",
  },
];

export function getPlan(code: string): Plan | undefined {
  return plans.find((plan) => plan.code === code);
}

/** Форматирует сумму в рублях для интерфейса. */
export function formatRub(amountMinor: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
