# Модель данных

## ERD

```
user 1 ──< session
user 1 ──< account
user 1 ──< cards >── 1 content word (JSON, без FK)
user 1 ──< selections
cards 1 ──< reviews
user 1 ── settings
user 1 ──< payments 1 ──< subscriptions
user 1 ──< subscriptions
user 1 ──< audit_log
```

Контент (`words.json`) не хранится в БД. `word_id` — это id из JSON, поэтому целостность контента обеспечивается тестом, а не foreign key.

## Таблицы

### Better Auth

| Таблица | Назначение |
| --- | --- |
| `user` | id, name, email, email_verified, image, role |
| `session` | token, expires_at, ip, user_agent, user_id |
| `account` | провайдер, password hash, tokens |
| `verification` | одноразовые токены reset/verification |

### Прогресс

| Таблица | Ключи и индексы |
| --- | --- |
| `cards` | PK id; unique `(user_id, word_id)`; index `(user_id, due)` |
| `selections` | PK id; unique `(user_id, word_id)` |
| `reviews` | PK id; index `(user_id, created_at)`, `(card_id)` |
| `settings` | PK user_id |

`cards.rev` увеличивается на каждом FSRS-переходе. `cards.id` на сервере имеет вид `${userId}:${clientCardId}`.

### Платежи

| Таблица | Ключи и индексы |
| --- | --- |
| `payments` | PK id; unique provider_payment_id, idempotence_key; index user_id, status |
| `subscriptions` | PK id; index user_id; index `(status, ends_at)` |
| `audit_log` | PK id; index created_at |

## Деньги

- Суммы хранятся в копейках (`integer`), не во float.
- Валюта — `RUB` (ISO 4217).
- Форматирование — `formatRub()`.
- Сумма платежа фиксируется в `payments.amount` на момент создания.
- Изменение тарифа не меняет старые платежи.

## Время

- В БД — `timestamptz`.
- В API и localStorage — ISO 8601 UTC.
- FSRS `due` — абсолютный момент следующего повтора.
- Дни для стрика считаются в локальной зоне браузера.

## Retención

Рекомендуется:

- карточки и отзывы — пока существует аккаунт;
- платежи и подписки — срок, требуемый бухгалтерией и законом;
- audit_log — не менее 1 года;
- verification/session — автоматическая очистка по истечении.

Политика удаления аккаунта в UI пока не реализована; SQL-удаление `user` каскадно удаляет прогресс и платежи (кроме audit_log, где actor_id станет null).

## Миграции

- `pnpm db:generate` создаёт SQL в `drizzle/`.
- `pnpm db:migrate` применяет.
- Миграции коммитятся вместе с изменением схемы.
- Destructive-миграции выполнять после backup и по схеме expand-and-contract.
