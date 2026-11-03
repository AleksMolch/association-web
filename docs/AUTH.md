# Аутентификация

## Регистрация

1. `POST /api/auth/sign-up/email` с name, email, password.
2. Better Auth проверяет длину пароля (8–128), нормализует email и хеширует пароль.
3. В development сессия создаётся сразу.
4. В production `requireEmailVerification=true`: письмо уходит через Resend, сессия не создаётся до подтверждения.
5. Роль по умолчанию — `user`; поле `role` не принимается от клиента.

## Подтверждение email

- Ссылка ведёт на `/api/auth/verify-email?token=...&callbackURL=...`.
- После подтверждения Better Auth перенаправляет на callback URL.
- `autoSignInAfterVerification=true`.
- Страница `/verify-email` объясняет шаги и позволяет отправить письмо повторно.
- В production без `RESEND_API_KEY` регистрация не завершится входом.

## Сброс пароля

1. `/forgot-password` отправляет `requestPasswordReset`.
2. Сервер всегда отвечает одинаково, чтобы не раскрывать наличие аккаунта.
3. Ссылка ведёт на API Better Auth, затем на `/reset-password?token=...`.
4. Токен одноразовый, срок — 1 час.
5. После сброса все сессии пользователя отзываются (`revokeSessionsOnPasswordReset`).

## Сессии

- Cookie HttpOnly, SameSite, Secure в production (Better Auth).
- Срок — 30 дней, обновление раз в сутки.
- Cookie cache — 5 минут.
- Выход — `authClient.signOut()`.
- Серверные страницы и route handlers читают сессию через `auth.api.getSession({ headers })`.

## Rate limits

Better Auth ограничивает 100 запросов в минуту на окно. Для production рекомендуется:

- отдельный лимит на sign-in и reset;
- WAF/прокси для распределённого брутфорса;
- алерты на всплеск 401/429.

## Админ

- Роль `admin` назначается SQL-ом.
- `/admin` проверяет роль на сервере.
- MFA для админа пока не реализована; перед production добавить.

## Удаление аккаунта

В UI пока нет. SQL:

```sql
delete from "user" where id = '...';
```

Каскад удалит сессии, карточки, выборы, отзывы, настройки, платежи и подписки. `audit_log.actor_id` станет null.

## Ошибки

- Не показывать, существует ли email.
- Не логировать пароль, токен и cookie.
- Ошибки Better Auth можно показывать пользователю в общем виде.
