# API

Все ответы — JSON. Ошибки имеют вид `{ "error": "CODE" }`. Авторизация — cookie Better Auth.

## Auth

`/api/auth/[...all]` — маршруты Better Auth (регистрация, вход, выход, сброс пароля, подтверждение email). Клиент — `src/lib/auth-client.ts`.

## Прогресс

### `GET /api/progress`

Требует сессию.

```json
{
  "cards": [
    {
      "id": "42:0:en-ru",
      "wordId": 42,
      "meaningId": "0",
      "direction": "en-ru",
      "due": "2026-01-02T09:00:00.000Z",
      "stability": 1.2,
      "difficulty": 4.8,
      "scheduledDays": 1,
      "reps": 1,
      "lapses": 0,
      "learningSteps": 0,
      "state": 2,
      "lastReview": "2026-01-01T09:00:00.000Z",
      "createdAt": "2026-01-01T08:00:00.000Z",
      "updatedAt": "2026-01-01T09:00:00.000Z",
      "rev": 2
    }
  ],
  "selections": { "42": "42-1" },
  "settings": {
    "dailyGoal": 10,
    "hintsEnabled": true,
    "reducedMotion": false,
    "ttsRate": 0.95,
    "associationSwipeHintSeen": false
  }
}
```

### `POST /api/progress`

Требует сессию. Тело — снимок гостя:

```json
{
  "cards": [],
  "selections": {},
  "settings": {},
  "reviews": []
}
```

Правила:

- карточка обновляется, если `incoming.rev > stored.rev`;
- выборы и настройки — last-write-wins;
- отзывы вставляются идемпотентно;
- ответ — актуальное состояние, как у `GET`.

Коды: `400 INVALID_BODY`, `401 UNAUTHORIZED`, `503 SYNC_FAILED`.

### `DELETE /api/progress`

Требует сессию. Удаляет карточки, выборы, настройки и отзывы пользователя. В UI пока не подключён.

## Платежи

### `POST /api/billing/create-payment`

Требует сессию.

```json
{ "planCode": "3m", "returnUrl": "https://example.com/dashboard/billing/return" }
```

`returnUrl` допускается только с тем же origin, что `NEXT_PUBLIC_APP_URL`.

Ответ:

```json
{ "paymentId": "uuid", "confirmationUrl": "https://yoomoney.ru/..." }
```

Коды: `400`, `401`, `502 PAYMENT_FAILED`, `503 BILLING_NOT_CONFIGURED`.

### `GET /api/billing/status?paymentId=...`

Требует сессию. Возвращает активную подписку, последние платежи и, если передан `paymentId`, конкретный платёж пользователя.

### `POST /api/billing/webhook`

Публичный webhook ЮKassa. Принимает:

```json
{
  "event": "payment.succeeded",
  "object": { "id": "provider-payment-id", "status": "succeeded" }
}
```

Обрабатывает `payment.succeeded` и `payment.canceled`. Идемпотентен. При заданном `YOOKASSA_TRUSTED_IPS` проверяет IP.

## Админка

`/admin` — HTML-страница, не API. Требует `role=admin`. Read-only.
