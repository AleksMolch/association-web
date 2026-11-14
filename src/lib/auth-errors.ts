/**
 * auth-errors.ts — перевод ошибок Better Auth на русский язык.
 *
 * Сервер возвращает технические сообщения вида «[body.email] Invalid email
 * address». В интерфейс такие строки не попадают: префиксы удаляются, а
 * известные ошибки заменяются понятными русскими формулировками.
 */

const KNOWN_ERRORS: { match: string; message: string }[] = [
  { match: "invalid email or password", message: "Неверный email или пароль." },
  { match: "invalid email address", message: "Введите корректный email." },
  { match: "invalid email", message: "Введите корректный email." },
  { match: "email is required", message: "Введите email." },
  { match: "invalid password", message: "Неверный пароль." },
  { match: "password is required", message: "Введите пароль." },
  { match: "password too short", message: "Пароль должен содержать минимум 8 символов." },
  { match: "password is too short", message: "Пароль должен содержать минимум 8 символов." },
  { match: "password too long", message: "Пароль слишком длинный." },
  { match: "user already exists", message: "Аккаунт с таким email уже существует. Войдите или сбросьте пароль." },
  { match: "already exists", message: "Аккаунт с таким email уже существует. Войдите или сбросьте пароль." },
  { match: "email not verified", message: "Подтвердите email — мы отправили письмо на вашу почту." },
  { match: "invalid token", message: "Ссылка недействительна или устарела. Запросите новую." },
  { match: "token expired", message: "Ссылка устарела. Запросите новую." },
  { match: "too many requests", message: "Слишком много попыток. Попробуйте через минуту." },
  { match: "session expired", message: "Сессия истекла. Войдите снова." },
  { match: "unauthorized", message: "Требуется вход в аккаунт." },
  { match: "invalid origin", message: "Запрос отклонён. Обновите страницу и попробуйте снова." },
  { match: "name is required", message: "Введите имя." },
];

/** Убирает технический префикс вида «[body.email] » из сообщения. */
export function stripAuthErrorPrefix(message: string): string {
  return message.replace(/^\s*(?:\[[^\]]+\]\s*)+/, "").trim();
}

/** Возвращает русское сообщение для известных ошибок или заданный fallback. */
export function humanizeAuthError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;

  const clean = stripAuthErrorPrefix(message);
  const normalized = clean.toLowerCase();

  for (const entry of KNOWN_ERRORS) {
    if (normalized.includes(entry.match)) return entry.message;
  }

  return fallback;
}
