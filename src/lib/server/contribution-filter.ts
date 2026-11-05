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
 * Домен без схемы требует буквенный TLD от двух символов или punycode-метку
 * `xn--…`. Это отсекает десятичные числа, даты и сокращения вроде «e.g»,
 * не мешая example.com, t.me и xn--p1ai. Отдельная ветка ловит IPv4.
 */
const URL_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})\b/gi;

/**
 * Телефон — 10+ цифр, разделённых пробелами, скобками и дефисами. Отдельная
 * ветка разрешает точки только при явном префиксе `+`, чтобы не путать даты
 * и десятичные числа с контактами.
 */
const PHONE_PATTERN =
  /\+?\d(?:[\s()-]*\d){9,}|\+\d(?:[.\s()-]*\d){9,}/g;

/** Возвращает флаги email/phone/url, найденные в тексте. */
export function detectSensitiveContent(text: string): SensitiveContentFlags {
  const email = emailPattern().test(text);
  const withoutEmail = text.replace(emailPattern(), " ");
  const phone = phonePattern().test(withoutEmail);
  const withoutPhone = withoutEmail.replace(phonePattern(), " ");
  const url = urlPattern().test(withoutPhone);

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
