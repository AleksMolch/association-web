const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** Маскирует email, оставляя первый символ локальной части и домен. */
export function maskEmail(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0) return "[redacted]";
  return `${value.slice(0, 1)}***@${value.slice(at + 1)}`;
}

/** Заменяет все email-подобные подстроки на маскированные. */
export function redactEmails(value: string): string {
  return value.replace(EMAIL_LIKE, (email) => maskEmail(email));
}
