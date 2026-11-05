# Модель данных

## ERD

```
user 1 ──< session
user 1 ──< account
user 1 ──< cards >── 1 content word (JSON, без FK)
user 1 ──< selections
cards 1 ──< reviews
user 1 ── settings
user 1 ──< user_mnemonics
user 1 ──1 contribution_preferences
user 1 ──< mnemonic_contributions (author, ON DELETE SET NULL)
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
| `reviews` | PK id; index `(user_id, created_at)`, `(card_id)`; поля `exercise_type`, `answer` |
| `settings` | PK user_id |

`cards.rev` увеличивается на каждом FSRS-переходе. `cards.id` на сервере имеет вид `${userId}:${clientCardId}`.

### Личные ассоциации

| Таблица | Ключи и индексы |
| --- | --- |
| `user_mnemonics` | PK id; index `(user_id, word_id)` частичный `WHERE deleted_at IS NULL` |

Поля: `id`, `user_id`, `word_id`, `meaning_id`, `cue_word`, `scene_text`, `locale`, `created_at`, `updated_at`, `deleted_at`, `rev`.

- `user_mnemonics.id` = `${userId}:${uuid}`; клиентский id может быть `usr-...` до синхронизации.
- `deleted_at` — tombstone, а не физическое удаление: запись нужна для синхронизации удаления.
- Изображения в таблице отсутствуют. Mobile хранит метаданные в локальной SQLite `local_mnemonic_media`, web — в IndexedDB; на сервер они не попадают.

### Согласие и вклады

| Таблица | Ключи и индексы |
| --- | --- |
| `contribution_preferences` | PK user_id |
| `mnemonic_contributions` | PK id; unique `(contributor_user_id, client_contribution_id)`; index `(status, created_at)` |

`contribution_preferences`: `status` (`unset/granted/declined/ask_later/withdrawn`), `consent_version`, `decided_at`, `next_prompt_at`, `updated_at`.

`mnemonic_contributions`: `id`, `client_contribution_id`, `contributor_user_id` (FK `ON DELETE SET NULL`), `source_mnemonic_id`, `word_id`, `meaning_id`, `cue_word`, `scene_text`, `locale`, `consent_version`, `submitted_at`, `status` (`pending/approved/rejected/duplicate/withdrawn`), `normalized_hash`, `moderation_reason`, `reviewed_by`, `reviewed_at`, `created_at`.

- Дубликаты определяются по `(contributor_user_id, client_contribution_id)` и по `(contributor_user_id, word_id, normalized_hash)`.
- `moderation_reason` может содержать префикс `sensitive_content:email,phone,url` и человеческий текст.
- Публикация не хранится отдельным статусом: `approve` не означает публикацию.

### Локальные данные мобильного клиента

| Таблица | Назначение |
| --- | --- |
| `user_mnemonics` | текст, `rev`, `deletedAt` |
| `local_mnemonic_media` | `mnemonic_id`, `local_uri`, MIME, размеры, checksum |
| `contribution_outbox` | очередь вкладов со статусом, попытками и `next_attempt_at` |
| `sync_meta` | `entity`, `last_pulled_at`, `last_pushed_at` |

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
- `ask_later` хранит `next_prompt_at = now + 30 дней`; локальный счётчик `promptAfterCount` на сервер не синхронизируется.

## Хранение и удаление

Рекомендуется:

- карточки и отзывы — пока существует аккаунт;
- личные ассоциации — до удаления пользователем; после удаления остаётся tombstone для синхронизации, физическая очистка пока не реализована;
- вклады — до отзыва или завершения редакционного цикла; `withdrawn`/`rejected` хранятся для истории модерации;
- платежи и подписки — срок, требуемый бухгалтерией и законом;
- audit_log — не менее 1 года;
- verification/session — автоматическая очистка по истечении.

Политика удаления аккаунта в UI пока не реализована; SQL-удаление `user` каскадно удаляет прогресс, личные ассоциации, настройки согласия и платежи. `mnemonic_contributions.contributor_user_id` становится `null`, `audit_log.actor_id` — `null`.

Подробнее — [PRIVACY.md](PRIVACY.md).

## Миграции

- `pnpm db:generate` создаёт SQL в `drizzle/`.
- `pnpm db:migrate` применяет.
- Миграции коммитятся вместе с изменением схемы.
- Destructive-миграции выполнять после backup и по схеме expand-and-contract.
- Миграция `0001_milky_northstar.sql` добавляет `user_mnemonics`, `contribution_preferences`, `mnemonic_contributions` и поля `reviews.exercise_type/answer`; перед деплоем её нужно применить.
