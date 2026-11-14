# Мнемослов — веб-приложение

Онлайн-сервис «Мнемослов» для запоминания английских слов через русские созвучные ассоциации, образы и интервальное повторение FSRS. Слоган: «Слово. Образ. Память.»

## Статус

Реализованы:

- публичные страницы: лендинг, метод, наука, демо, тарифы, оферта, политика, условия;
- гостевой тренажёр с локальным прогрессом в `localStorage`;
- личный кабинет: обзор, прогресс, слова, карточка слова, настройки;
- Better Auth: регистрация, вход, сброс пароля, подтверждение email, Expo-клиент;
- API облачного прогресса с last-write-wins по `rev`;
- личные ассоциации: текст, выбор, тренировка, tombstone;
- локальные изображения личных ассоциаций в IndexedDB (не загружаются на сервер);
- VIP-гейт для мобильной синхронизации `/api/mobile/sync`;
- согласие на текстовые вклады, batch/withdraw, очереди и модерация;
- ЮKassa: создание платежа, webhook, подписка VIP;
- админка с очередью модерации вкладов;
- тесты FSRS, API, безопасности и целостности контента.

Требуют настройки перед production:

- PostgreSQL и миграции (включая `0001`);
- `BETTER_AUTH_SECRET`, `DATABASE_URL`, `MODERATION_PSEUDONYM_SECRET`;
- SMTP NetAngels / Nodemailer для писем;
- магазин ЮKassa и публичный webhook;
- юридические тексты, 152-ФЗ и 54-ФЗ;
- проверка тарифов и возвратов.

## Стек

- Next.js 16 App Router, React 19, TypeScript;
- Tailwind CSS 4;
- Better Auth + Drizzle ORM + PostgreSQL;
- `ts-fsrs` 6;
- ЮKassa API v3;
- IndexedDB для локальных изображений;
- Vitest.

## Быстрый старт

```bash
cp .env.example .env.local
pnpm install
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Откройте `http://localhost:3000`. Гостевой режим и публичные страницы работают без БД. Для входа, облака, админки и оплаты заполните `.env.local` и примените схему.

## Скрипты

| Команда | Назначение |
| --- | --- |
| `pnpm dev` | разработка |
| `pnpm build` | production-сборка |
| `pnpm start` | запуск собранного приложения |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript без emit |
| `pnpm test` | Vitest один раз |
| `pnpm db:generate` | сгенерировать миграцию |
| `pnpm db:migrate` | применить миграции |
| `pnpm db:push` | быстро синхронизировать схему (только dev) |
| `pnpm db:studio` | Drizzle Studio |

## Контент

- 1480 слов;
- 2668 ассоциаций;
- 2664 WebP-иллюстрации в `public/images/words`;
- 4 ассоциации используют `placeholder.png` (doom, furniture, glance ×2);
- словарь: `src/content/words.json`;
- изображения: `public/images/words`.

Контент не дублируется в БД: сервер и клиент используют один JSON. Подробнее — [docs/CONTENT.md](docs/CONTENT.md).

## Маршруты

Публичные: `/`, `/method`, `/science`, `/demo`, `/pricing`, `/privacy`, `/terms`, `/offer`.

Приложение: `/dashboard`, `/dashboard/words`, `/dashboard/words/[id]`, `/dashboard/progress`, `/dashboard/settings`, `/dashboard/billing`, `/train`.

Auth: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`.

Служебные: `/admin`, `/admin/contributions`, `/api/auth/[...all]`, `/api/progress`, `/api/mobile/sync`, `/api/user-mnemonics`, `/api/privacy/contribution-preference`, `/api/mnemonic-contributions/*`, `/api/admin/mnemonic-contributions`, `/api/billing/*`.

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [Стек](docs/STACK.md)
- [Модель данных](docs/DATA_MODEL.md)
- [Аутентификация](docs/AUTH.md)
- [Пользовательские ассоциации](docs/USER_MNEMONICS.md)
- [Приватность](docs/PRIVACY.md)
- [ЮKassa](docs/BILLING_YOOKASSA.md)
- [Синхронизация](docs/SYNC_PROTOCOL.md)
- [Дизайн-система](docs/DESIGN_SYSTEM.md)
- [Эксплуатация](docs/OPERATIONS.md)
- [Безопасность](docs/SECURITY.md)
- [Контент](docs/CONTENT.md)
- [API](docs/API.md)
- [ADR](docs/ADR)

## Ограничения

- Автопродление подписок не реализовано: продление вручную добавляет срок.
- Возвраты через UI не реализованы.
- Админка контента read-only; модерация вкладов не публикует контент автоматически.
- Изображения личных ассоциаций не синхронизируются и не входят в backup.
- Rate limit вкладов действует в пределах одного процесса.
- CSP пока не настроен; действуют базовые security headers.
- Юридические страницы — шаблоны, не юридическая консультация.
- Мобильное приложение находится в отдельном репозитории и не входит в этот проект.
