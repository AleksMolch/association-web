/**
 * legal.ts — реквизиты оператора персональных данных.
 *
 * Значения задаются в окружении. До заполнения на страницах отображаются
 * явные заглушки, чтобы реквизиты нельзя было случайно опубликовать пустыми.
 */

export const legal = {
  operatorName: process.env.LEGAL_OPERATOR_NAME || "[ФИО самозанятого]",
  operatorInn: process.env.LEGAL_OPERATOR_INN || "[ИНН]",
  contactEmail: process.env.LEGAL_CONTACT_EMAIL || "support@mnemoslov.ru",
  get configured(): boolean {
    return (
      !this.operatorName.startsWith("[") &&
      !this.operatorInn.startsWith("[")
    );
  },
} as const;
