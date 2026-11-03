# Архитектура

## Общая схема

```
Браузер
├── публичные страницы (Server Components, статические)
├── /train и /dashboard (Client Components + guest-store)
│   └── localStorage: карточки, выборы, настройки, отзывы
└── /api/*
    ├── /api/auth/[...all]      Better Auth
    ├── /api/progress           облачный прогресс
    └── /api/billing/*          ЮKassa и подписка

PostgreSQL
├── Better Auth: user, session, account, verification
├── прогресс: cards, selections, reviews, settings
├── платежи: payments, subscriptions, audit_log
```

## Клиентское состояние

`src/lib/guest-store.tsx` — внешний store поверх `localStorage`:

- `useSyncExternalStore` отдаёт пустой снимок на сервере и сохранённый на клиенте;
- все мутации создают новый объект состояния и пишут его в `localStorage`;
- между вкладками состояние обновляется по событию `storage`;
- компоненты не знают, гость это или авторизованный пользователь: контракт одинаков.

Очередь занятия строится один раз в `src/components/study/trainer.tsx` и сохраняется в `sessionStorage`. После перезагрузки очередь восстанавливается; завершённая очередь удаляется.

## FSRS

`src/lib/fsrs.ts` — адаптер над `ts-fsrs`:

- карточка сериализуема и совместима с мобильным приложением;
- `createNewCard` создаёт карточку с детерминированным id;
- `applyRating` возвращает новое состояние и увеличивает `rev`;
- `formatNextReview` и `stateLabel` не знают о хранилище.

## Серверный прогресс

`GET /api/progress` возвращает карточки, выборы и настройки.

`POST /api/progress` принимает снимок:

- карточки обновляются только если входящий `rev` больше серверного;
- выборы и настройки обновляются last-write-wins;
- отзывы вставляются с `ON CONFLICT DO NOTHING`;
- серверные id карточек и отзывов строятся как `${userId}:${clientId}`, чтобы избежать коллизий между пользователями.

`DELETE /api/progress` удаляет прогресс пользователя. В UI пока не подключён.

## Аутентификация

`src/lib/auth.ts`:

- email + пароль, минимум 8 символов;
- подтверждение email требуется только в production;
- сброс пароля через Resend;
- роль `admin` хранится в `user.role` и недоступна для ввода клиентом;
- сессия 30 дней, cookie cache 5 минут;
- `nextCookies()` подключает cookie к Next.js.

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

Подробнее — [OPERATIONS.md](OPERATIONS.md).

## Cache Components

В `next.config.ts` включены `cacheComponents` и `partialPrefetching`. Поэтому:

- динамические данные читаются в Server Components с `await headers()` (admin);
- параметры маршрута `/dashboard/words/[id]` читаются в Suspense-обёртке;
- клиентские компоненты не вызывают `new Date()` во время пререндера;
- route segment config `dynamic`/`runtime` не используется.

## Границы

- Контент обновляется деплоем, а не через админку.
- Платежи не поддерживают рекуррентные списания.
- Нет OAuth и социальных входов.
- Нет email-рассылок, кроме транзакционных писем.
- Нет фоновых задач: webhook обрабатывается синхронно.
