# Эксплуатация

## 1. База данных

Создайте PostgreSQL и задайте `DATABASE_URL`. Для локального запуска есть `docker-compose.yml`:

```bash
docker compose up -d
```

```bash
pnpm db:generate
pnpm db:migrate
```

Для локальной разработки допустим `pnpm db:push`, но production используйте миграции.

Миграция `0001_milky_northstar.sql` добавляет `user_mnemonics`, `contribution_preferences`, `mnemonic_contributions` и поля `reviews.exercise_type/answer`. Применяйте её до деплоя приложения, использующего личные ассоциации и вклады.

Release gate: автоматический прогон миграции против PostgreSQL не входит в unit-тесты репозитория (нет PostgreSQL в CI). Перед production примените миграцию к копии реальной схемы, проверьте `user_mnemonics`, `contribution_preferences`, `mnemonic_contributions`, `reviews.exercise_type/answer` и только затем деплойте приложение.

Проверка подключения:

```bash
psql "$DATABASE_URL" -c "select 1"
```

## 2. Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните:

| Переменная | Обязательна | Назначение |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | да | публичный URL, return URL платежей |
| `BETTER_AUTH_URL` | да | база Better Auth |
| `BETTER_AUTH_SECRET` | да | случайный секрет ≥32 символов |
| `MODERATION_PSEUDONYM_SECRET` | да в production | отдельный HMAC-секрет псевдонимных id авторов вкладов |
| `APP_MOBILE_ORIGIN` | для mobile | origin Expo-схемы, можно несколько через запятую |
| `DATABASE_URL` | да | PostgreSQL |
| `SMTP_HOST` | для писем | `mail.netangels.ru` |
| `SMTP_PORT` | для писем | 465 (TLS) или 587 (STARTTLS) |
| `SMTP_SECURE` | для писем | `true` для 465 |
| `SMTP_USER` | для писем | полный адрес ящика |
| `SMTP_PASS` | для писем | пароль ящика |
| `EMAIL_FROM` | для писем | подпись отправителя |
| `YOOKASSA_SHOP_ID` | для оплаты | магазин ЮKassa |
| `YOOKASSA_SECRET_KEY` | для оплаты | секретный ключ |
| `YOOKASSA_TRUSTED_IPS` | рекомендуется | точные IP webhook через запятую, без CIDR |

Секреты не коммитятся. `.env.example` содержит только заглушки.

## 3. Администратор и модерация

После регистрации назначьте роль:

```sql
update "user" set role = 'admin' where email = 'admin@example.com';
```

После входа откройте `/admin`. Раздел read-only; управление контентом и тарифами выполняется через код и миграции. Очередь вкладов доступна по ссылке «Модерация вкладов» (`/admin/contributions`).

В production обязательно задайте `MODERATION_PSEUDONYM_SECRET` — отдельный случайный секрет ≥32 символов. Он используется для HMAC-псевдонимов авторов вкладов; смена секрета меняет все псевдонимы и усложняет сопоставление решений. Без переменной используется `BETTER_AUTH_SECRET`, в development — небезопасный fallback.

Модерация:

- очередь по умолчанию `pending`; limit по умолчанию 50, максимум 200 записей на страницу;
- действия: `approve`, `reject`, `duplicate`, `needs_edit`, `withdraw`;
- `reject` и `needs_edit` требуют причину;
- `approve` означает «одобрено для ручной редактуры», а не публикацию;
- `withdrawn` терминален: другие действия возвращают `409`;
- email и сырой `userId` в очередь не возвращаются, только псевдоним.

## 4. Согласие и очередь вкладов

- Пользователь даёт согласие в настройках приватности или в диалоге после третьей ассоциации.
- Сервер проверяет `granted` при каждом batch; без согласия — `403`.
- Очереди: mobile SQLite, web localStorage. Отправка — до 50 записей, повтор с backoff.
- Смена статуса на `withdrawn` очищает неотправленную очередь, но не отзывает уже переданные вклады: для этого есть отдельное действие/API.
- Rate limit: 30 batch-запросов на пользователя в час.
- Счётчик in-memory: действует в одном процессе и сбрасывается при рестарте/деплое. Несколько инстансов не разделяют лимит; для строгого лимита нужен Redis или счётчик в PostgreSQL.
- Отзыв вкладов не ограничен отдельным rate limit.

## 5. Почта

1. Создайте ящик на `mail.netangels.ru` (например `support@mnemoslov.ru`).
2. В DNS домена настройте MX, SPF, DKIM и DMARC.
3. Задайте `SMTP_HOST=mail.netangels.ru`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.
4. Проверьте сброс пароля и подтверждение email.

Письма отправляются через Nodemailer по SMTP. Без SMTP-переменных письма не уходят. В development в лог пишется только факт события с маскированным получателем, без токенов и ссылок.

В production `requireEmailVerification` включён: без рабочей почты пользователи не смогут войти после регистрации.

## 6. ЮKassa

1. Создайте магазин и получите `shopId` и секретный ключ.
2. Задайте `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`.
3. Укажите webhook URL:

```
https://<домен>/api/billing/webhook
```

4. Включите события `payment.succeeded` и `payment.canceled`.
5. При необходимости заполните `YOOKASSA_TRUSTED_IPS` (точные IP, без CIDR).
6. Проведите тестовый платёж.

Важно:

- VIP активирует только webhook, не return URL;
- сумма берётся из `src/lib/billing/plans.ts`, клиент не может её подменить;
- повторная доставка webhook идемпотентна;
- после смены тарифов старые платежи сохраняют исходную сумму;
- чеки 54-ФЗ и настройки налогов требуют отдельной проверки в кабинете ЮKassa;
- текущий scope — разовые платежи; автоплатежи и возвраты через UI не реализованы;
- официальные IP ЮKassa включают CIDR, а код сравнивает только точные адреса — см. [BILLING_YOOKASSA.md](BILLING_YOOKASSA.md).

## 7. Деплой

Минимальный чек-лист:

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] миграции применены (включая `0001`)
- [ ] заданы все production-секреты, включая `MODERATION_PSEUDONYM_SECRET`
- [ ] настроен HTTPS
- [ ] проверены регистрация, вход, сброс пароля
- [ ] проверены mobile login, VIP-гейт и `/api/mobile/sync`
- [ ] проверены consent, batch вкладов и очередь модерации
- [ ] проверен webhook ЮKassa
- [ ] проверены юридические страницы и согласия
- [ ] настроены резервные копии БД

## 8. Резервное копирование

- ежедневный дамп PostgreSQL;
- хранение вне основного сервера;
- проверка восстановления раз в месяц;
- логи webhook хранить не менее срока, достаточного для разбора платежей;
- изображения личных ассоциаций не входят в серверный backup: они локальные и не восстанавливаются на другом устройстве.

## 9. Security headers и CSP

`next.config.ts` задаёт `nosniff`, `DENY` для frame, `Referrer-Policy`, `Permissions-Policy`, `COOP` и HSTS. CSP не настроен: inline-скрипты Next.js и Cache Components требуют nonce/middleware-подхода с e2e-проверкой. Это документированный follow-up, а не забытая настройка.

## 10. Диагностика

| Симптом | Проверьте |
| --- | --- |
| `/admin` показывает «База данных не готова» | `DATABASE_URL`, миграции, роль admin |
| Вход возвращает 500 | `BETTER_AUTH_SECRET`, БД, схему Better Auth |
| Mobile login не работает | `APP_MOBILE_ORIGIN`, `EXPO_PUBLIC_WEB_URL`, Better Auth Expo plugin |
| Mobile sync возвращает 403 | активную VIP-подписку пользователя |
| Вклад не отправляется | согласие `granted`, очередь, rate limit, логи `[mnemonic-contributions:*]` |
| Очередь модерации пуста | статус, `MODERATION_PSEUDONYM_SECRET`, миграцию `0001` |
| Письмо не приходит | `SMTP_*`, `EMAIL_FROM`, SPF/DKIM/DMARC, спам |
| Оплата возвращает `BILLING_NOT_CONFIGURED` | ключи ЮKassa |
| VIP не активируется | webhook URL, события, IP allowlist, логи `[billing:webhook]` |
| Сборка падает на `new Date()` | не вызывать время в серверном/client-пререндере |
