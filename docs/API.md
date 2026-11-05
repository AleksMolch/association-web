# API

Все ответы — JSON. Ошибки имеют вид `{ "error": "CODE" }`. Авторизация — cookie Better Auth.

## Auth

`/api/auth/[...all]` — маршруты Better Auth (регистрация, вход, выход, сброс пароля, подтверждение email). Клиент — `src/lib/auth-client.ts`; мобильный клиент использует `@better-auth/expo`.

## Прогресс

### `GET /api/progress`

Требует сессию. Доступен без VIP.

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
  },
  "userMnemonics": []
}
```

### `POST /api/progress`

Требует сессию. Тело — снимок:

```json
{
  "cards": [],
  "selections": {},
  "settings": {},
  "reviews": [],
  "userMnemonics": []
}
```

Правила:

- карточка обновляется, если входящий `rev` больше серверного; при равенстве — по `updatedAt`;
- личные ассоциации — по `rev`/`updatedAt`, tombstone побеждает активную при равенстве;
- выборы и настройки — last-write-wins по `updatedAt`;
- отзывы вставляются идемпотентно;
- ответ — актуальное состояние, как у `GET`.

Коды: `400 INVALID_BODY`, `401 UNAUTHORIZED`, `503 SYNC_FAILED`.

### `DELETE /api/progress`

Требует сессию. Удаляет карточки, выборы, настройки и отзывы пользователя. Личные ассоциации не удаляет. В UI пока не подключён.

## Мобильная синхронизация (VIP)

### `GET /api/mobile/sync`

Требует сессию и активную VIP-подписку.

```json
{
  "cards": [],
  "reviews": [],
  "selections": [{ "wordId": 42, "mnemonicId": "0", "updatedAt": "..." }],
  "settings": { "dailyGoal": 10, "hintsEnabled": true, "reducedMotion": false, "ttsRate": 0.95, "updatedAt": "..." },
  "userMnemonics": []
}
```

### `POST /api/mobile/sync`

Требует сессию и VIP. Принимает тот же снимок, сливает и возвращает актуальное состояние. Схема строгая: `userId` и media-поля запрещены. Отзывы — до 10 000 за запрос со стороны клиента.

Коды: `400 INVALID_BODY`, `401 UNAUTHORIZED`, `403 VIP_REQUIRED`, `503 SYNC_FAILED`.

Подробнее — [SYNC_PROTOCOL.md](SYNC_PROTOCOL.md).

## Личные ассоциации

### `GET /api/user-mnemonics?wordId=`

Требует сессию. Возвращает активные ассоциации владельца; `wordId` опционален. Неизвестное слово — `400 INVALID_WORD`.

### `POST /api/user-mnemonics`

Требует сессию.

```json
{ "wordId": 42, "meaningId": "0", "cueWord": "Брат", "sceneText": "Брат светит фонарём" }
```

`201` — созданная ассоциация с `rev: 1`, `deletedAt: null`. Лишние поля, включая `userId`, `image`, `uri`, `fileName`, `base64`, отклоняются.

### `PATCH /api/user-mnemonics/:id`

Требует сессию. Принимает `cueWord` и/или `sceneText`; увеличивает `rev`. Чужая, отсутствующая или удалённая запись — `404`.

### `DELETE /api/user-mnemonics/:id`

Требует сессию. Ставит tombstone (`deletedAt`, `rev + 1`). Повторное удаление идемпотентно. Чужая запись — `404`.

## Согласие на вклады

### `GET /api/privacy/contribution-preference`

Требует сессию. Возвращает `{ status, consentVersion, decidedAt, nextPromptAt }`; по умолчанию `status: "unset"`.

### `PUT /api/privacy/contribution-preference`

Требует сессию.

```json
{ "status": "granted", "consentVersion": "1.0" }
```

Статусы: `unset`, `granted`, `declined`, `ask_later`, `withdrawn`. `ask_later` выставляет `nextPromptAt` на 30 дней. Строгая схема запрещает `userId`.

## Вклады

### `POST /api/mnemonic-contributions/batch`

Требует сессию и серверное согласие `granted`, иначе `403 CONSENT_REQUIRED`.

```json
{ "items": [{ "clientContributionId": "uuid", "sourceMnemonicId": "usr-...", "wordId": 42, "meaningId": "0", "cueWord": "Брат", "sceneText": "Брат светит фонарём", "locale": "ru", "consentVersion": "1.0", "submittedAt": "..." }] }
```

- до 50 записей;
- идемпотентность по `(user, clientContributionId)` и нормализованному хешу;
- PII/URL/телефон помечаются и остаются `pending`;
- media-поля запрещены;
- rate limit: 30 запросов на пользователя в час в пределах процесса, иначе `429 RATE_LIMITED`.

Ответ: `{ accepted: { count, ids }, duplicates: { count, ids }, rejected: { count, items } }`.

### `POST /api/mnemonic-contributions/withdraw`

Требует сессию.

```json
{ "sourceMnemonicIds": ["usr-..."] }
```

Переводит свои `pending`/`approved`/`duplicate` записи в `withdrawn`; чужие и опубликованные не меняет. До 200 id. Ответ: `{ count }`.

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

Обрабатывает `payment.succeeded` и `payment.canceled`. Идемпотентен. При заданном `YOOKASSA_TRUSTED_IPS` проверяет точный IP.

## Админка и модерация

- `/admin` — HTML-страница, требует `role=admin`.
- `/admin/contributions` — очередь вкладов и решения.
- `GET /api/admin/mnemonic-contributions?status=&limit=&offset=` — очередь; статус по умолчанию `pending`, limit до 200; без email и сырого `userId`.
- `POST /api/admin/mnemonic-contributions/:id/decision` — `{ action, reason? }`, где action: `approve`, `reject`, `duplicate`, `needs_edit`, `withdraw`. `reject`/`needs_edit` требуют причину. `approve` не публикует контент. `withdrawn` терминален (`409`).

Подробнее — [USER_MNEMONICS.md](USER_MNEMONICS.md) и [PRIVACY.md](PRIVACY.md).
