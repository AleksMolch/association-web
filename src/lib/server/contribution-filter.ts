/**
 * contribution-filter.ts — эвристики для пометки контактов в тексте вклада.
 *
 * Фильтр не блокирует отправку: подозрительные записи всё равно сохраняются
 * со статусом pending и причиной для ручной проверки модератором.
 */

export type SensitiveContentFlags = {
  email: boolean;
  phone: boolean;
  url: boolean;
};

const EMAIL_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

/**
 * Домен без схемы требует буквенный TLD от двух символов. Это отсекает
 * десятичные числа, даты и сокращения вроде «e.g», не мешая example.com
 * и t.me.
 */
const URL_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi;

/**
 * Телефон — 10+ цифр, разделённых пробелами, скобками и дефисами. Точки
 * исключены, чтобы даты и десятичные числа не считались контактами.
 */
const PHONE_PATTERN = /\+?\d(?:[\s()-]*\d){9,}/g;

/** Возвращает флаги email/phone/url, найденные в тексте. */
export function detectSensitiveContent(text: string): SensitiveContentFlags {
  const email = emailPattern().test(text);
  const withoutEmail = text.replace(emailPattern(), " ");
  const url = urlPattern().test(withoutEmail);
  const withoutContacts = withoutEmail.replace(urlPattern(), " ");
  const phone = phonePattern().test(withoutContacts);

  return { email, phone, url };
}

function emailPattern(): RegExp {
  return new RegExp(EMAIL_PATTERN.source, EMAIL_PATTERN.flags);
}

function urlPattern(): RegExp {
  return new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
}

function phonePattern(): RegExp {
  return new RegExp(PHONE_PATTERN.source, PHONE_PATTERN.flags);
}
