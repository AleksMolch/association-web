# Архитектура

## Общая схема

```
Браузер
├── публичные страницы (Server Components, статические)
├── /train и /dashboard (Client Components + guest-store)
│   ├── localStorage: карточки, выборы, настройки, отзывы, тексты ассоциаций
│   └── IndexedDB: изображения личных ассоциаций (только локально)
├── мобильное приложение (Expo, отдельный репозиторий)
│   ├── SQLite: прогресс, личные ассоциации, очередь вкладов
│   └── documentDirectory: изображения личных ассоциаций (только локально)
└── /api/*
    ├── /api/auth/[...all]              Better Auth (+ Expo plugin)
    ├── /api/progress                   веб-прогресс, бесплатно для аккаунта
    ├── /api/mobile/sync                полный прогресс, только VIP
    ├── /api/user-mnemonics             CRUD личных ассоциаций
    ├── /api/privacy/*                  согласие на вклады
    ├── /api/mnemonic-contributions/*   batch/withdraw текстовых вкладов
    ├── /api/admin/*                    очередь и решения модерации
    └── /api/billing/*                  ЮKassa и подписка

PostgreSQL
├── Better Auth: user, session, account, verification
├── прогресс: cards, selections, reviews, settings
├── личные ассоциации: user_mnemonics
├── вклады: contribution_preferences, mnemonic_contributions
├── платежи: payments, subscriptions, audit_log
```

## Клиентское состояние

`src/lib/guest-store.tsx` — внешний store поверх `localStorage`:

- `useSyncExternalStore` отдаёт пустой снимок на сервере и сохранённый на клиенте;
- все мутации создают новый объект состояния и пишут его в `localStorage`;
- между вкладками состояние обновляется по событию `storage`;
- компоненты не знают, гость это или авторизованный пользователь: контракт одинаков;
- тексты личных ассоциаций лежат в том же снимке, а изображения — отдельно в IndexedDB.

Очередь занятия строится один раз в `src/components/study/trainer.tsx` и сохраняется в `sessionStorage`. После перезагрузки очередь восстанавливается; завершённая очередь удаляется.

## FSRS

`src/lib/fsrs.ts` — адаптер над `ts-fsrs`:

- карточка сериализуема и совместима с мобильным приложением;
- `createNewCard` создаёт карточку с детерминированным id;
- `applyRating` возвращает новое состояние и увеличивает `rev`;
- `formatNextReview` и `stateLabel` не знают о хранилище.

## Личные ассоциации

- `user_mnemonics` хранит текст, `rev`, `updatedAt` и `deletedAt` (tombstone).
- Удаление не стирает строку физически: tombstone синхронизирует удаление и не даёт старой ревизии воскресить запись.
- Изображения не входят в сущность на сервере: mobile хранит файл в document directory, web — в IndexedDB.
- На другом устройстве изображения нет, поэтому UI показывает placeholder, а не делает вид, что картинка синхронизирована.
- CRUD API — `/api/user-mnemonics`; серверные id имеют вид `${userId}:${uuid}`.
- Подробнее — [USER_MNEMONICS.md](USER_MNEMONICS.md) и [ADR 0006](ADR/0006-user-mnemonics-local-images.md).

## Серверный прогресс

`GET /api/progress` возвращает карточки, выборы, настройки и тексты личных ассоциаций. Это бесплатный облачный прогресс для любого авторизованного веб-пользователя.

`POST /api/progress` принимает снимок:

- карточки обновляются только если входящий `rev` больше серверного (при равенстве — по `updatedAt`);
- личные ассоциации обновляются по `rev`/`updatedAt`, tombstone участвует наравне с активными;
- выборы и настройки обновляются last-write-wins по `updatedAt`;
- отзывы вставляются с `ON CONFLICT DO NOTHING`;
- серверные id карточек, отзывов и ассоциаций строятся как `${userId}:${clientId}`, чтобы избежать коллизий между пользователями.

`DELETE /api/progress` удаляет прогресс пользователя. В UI пока не подключён.

## Мобильная синхронизация и VIP

- `/api/mobile/sync` (GET/POST) требует сессию и активную VIP-подписку (`requireVip`).
- GET возвращает `{ cards, reviews, selections, settings, userMnemonics }`.
- POST принимает тот же снимок, сливает по правилам выше и возвращает актуальное состояние.
- Без сессии — `401`, без VIP — `403 VIP_REQUIRED`.
- Мобильный клиент сначала скачивает серверный снимок, затем отправляет объединённое состояние; отзывы чанкуются до 10 000 за запрос.
- Изображения и локальные URI в схеме запрещены: `.strict()` отклоняет лишние поля.
- При истечении VIP мобильный клиент выходит из аккаунта, но сохраняет локальные данные и базовое обучение.

Подробнее — [SYNC_PROTOCOL.md](SYNC_PROTOCOL.md).

## Согласие и вклады

- Согласие хранится в `contribution_preferences`: статус, версия, `decidedAt`, `nextPromptAt`.
- Статусы: `unset`, `granted`, `declined`, `ask_later`, `withdrawn`. Автомат согласия продублирован в web и mobile.
- `/api/mnemonic-contributions/batch` принимает до 50 текстовых вкладов, проверяет `granted` на сервере, идемпотентен и считает нормализованный хеш.
- Подозрительный текст (email/phone/url) помечается и остаётся `pending` для ручной модерации.
- Клиенты держат очередь: mobile в SQLite, web в localStorage; повторяют с backoff, `403` останавливает очередь.
- Админка `/admin/contributions` показывает очередь, решения `approve/reject/duplicate/needs_edit/withdraw`; `approve` не публикует контент автоматически.
- Псевдоним автора — HMAC от `userId` с `MODERATION_PSEUDONYM_SECRET`; email и сырой `userId` в очередь не попадают.

Подробнее — [ADR 0007](ADR/0007-contributions-consent.md).

## Аутентификация

`src/lib/auth.ts`:

- email + пароль, минимум 8 символов;
- подтверждение email требуется только в production;
- сброс пароля через Resend;
- роль `admin` хранится в `user.role` и недоступна для ввода клиентом;
- сессия 30 дней, cookie cache 5 минут;
- `nextCookies()` подключает cookie к Next.js;
- `@better-auth/expo` подключает мобильный клиент к тому же Better Auth.

Клиент: `src/lib/auth-client.ts`, формы в `src/app/(auth)`.

## Платежи

Поток:

1. Клиент отправляет только `planCode`; сервер берёт сумму из `plans.ts`.
2. Создаётся запись `payments` со статусом `pending`.
3. ЮKassa возвращает `confirmation_url`.
4. Пользователь оплачивает и возвращается на `/dashboard/billing/return`.
5. VIP активирует только webhook `payment.succeeded`.
6. `subscriptions` продлевается от текущей даты окончания.
7. Повторный webhook не создаёт вторую подписку.

Подробнее — [BILLING_YOOKASSA.md](BILLING_YOOKASSA.md) и [OPERATIONS.md](OPERATIONS.md).

## Cache Components

В `next.config.ts` включены `cacheComponents` и `partialPrefetching`. Поэтому:

- динамические данные читаются в Server Components с `await headers()` (admin);
- параметры маршрута `/dashboard/words/[id]` читаются в Suspense-обёртке;
- клиентские компоненты не вызывают `new Date()` во время пререндера;
- route segment config `dynamic`/`runtime` не используется.

## Границы

- Контент обновляется деплоем, а не через админку.
- Изображения личных ассоциаций не загружаются на сервер.
- Одобренный вклад не публикуется автоматически.
- Платежи не поддерживают рекуррентные списания и возвраты через UI.
- Нет OAuth и социальных входов.
- Нет email-рассылок, кроме транзакционных писем.
- Нет фоновых задач и распределённых очередей: webhook и outbox обрабатываются синхронно.
