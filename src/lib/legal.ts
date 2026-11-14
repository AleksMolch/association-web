/**
 * legal.ts — реквизиты оператора персональных данных.
 *
 * Значения можно переопределить переменными окружения. По умолчанию указаны
 * реквизиты из юридических документов сервиса.
 */

export const legal = {
  operatorName:
    process.env.LEGAL_OPERATOR_NAME || "Молчанов Александр Владимирович",
  operatorInn: process.env.LEGAL_OPERATOR_INN || "660303236183",
  contactEmail: process.env.LEGAL_CONTACT_EMAIL || "support@mnemoslov.ru",
} as const;
