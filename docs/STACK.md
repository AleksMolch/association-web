# Стек

Версии зафиксированы в `package.json` и `pnpm-lock.yaml`. Обновление — отдельным PR с прогоном lint, typecheck, tests и build.

## Next.js 16

- **Зачем:** App Router, Server Components, Route Handlers, Cache Components, SEO.
- **Проблема:** один проект для лендинга, кабинета, API и auth.
- **Альтернативы:** Vite SPA (хуже SEO), Astro + отдельный API (больше инфраструктуры), Remix.
- **Документация:** https://nextjs.org/docs
- **Правило обновления:** читать migration guide; проверять `cacheComponents`, route handlers и pre-render.

## React 19

- **Зачем:** Server/Client Components, `useSyncExternalStore`, современные hooks.
- **Альтернативы:** Vue, Svelte — не совпадают с экосистемой Next.js.
- **Документация:** https://react.dev

## TypeScript 5

- **Зачем:** строгая типизация контента, FSRS-карточек, API и БД.
- **Альтернативы:** JavaScript — выше риск ошибок в платёжном и auth-коде.
- **Документация:** https://www.typescriptlang.org/docs

## Tailwind CSS 4

- **Зачем:** дизайн-токены, адаптивность, тёмная тема, малый CSS.
- **Альтернативы:** CSS Modules (медленнее итерации), styled-components (runtime).
- **Документация:** https://tailwindcss.com/docs

## Better Auth

- **Зачем:** email/password, сессии, verification, reset, rate limit, Drizzle adapter.
- **Альтернативы:** Auth.js (меньше встроенных email-сценариев), Clerk/Auth0 (внешняя зависимость и цена), собственная auth (высокий риск).
- **Документация:** https://www.better-auth.com/docs
- **Правило:** не писать собственную криптографию и не хранить пароли вручную.

## Drizzle ORM + PostgreSQL

- **Зачем:** typed schema, SQL-миграции, предсказуемые запросы, транзакции.
- **Альтернативы:** Prisma (тяжелее runtime и генерация), Kysely (меньше schema tooling).
- **Документация:** https://orm.drizzle.team/docs
- **Правило:** production-миграции только через `drizzle-kit generate` + `migrate`.

## ts-fsrs 6

- **Зачем:** та же FSRS-логика, что в мобильном приложении.
- **Альтернативы:** SM-2 (хуже качество), собственная FSRS (риск расхождений).
- **Документация:** https://github.com/open-spaced-repetition/ts-fsrs
- **Правило:** версия должна совпадать с мобильной; менять одновременно.

## ЮKassa API v3

- **Зачем:** российские платежи, redirect-сценарий, webhook.
- **Альтернативы:** Robokassa, Tinkoff Kassa, Stripe (не для РФ).
- **Документация:** https://yookassa.ru/developers/api
- **Правило:** прямая интеграция через `fetch`; сумма только на сервере.

## Resend

- **Зачем:** транзакционные письма без собственного SMTP.
- **Альтернативы:** Postmark, Unisender, собственный SMTP.
- **Документация:** https://resend.com/docs
- **Правило:** домен подтверждён, ключ только на сервере.

## Recharts

- **Зачем:** график повторений в кабинете.
- **Альтернативы:** Chart.js, SVG вручную.
- **Документация:** https://recharts.org
- **Правило:** график не должен быть единственным способом получить данные.

## Vitest

- **Зачем:** быстрые unit-тесты FSRS и контента.
- **Альтернативы:** Jest (медленнее с ESM), Node test runner.
- **Документация:** https://vitest.dev
- **Правило:** критичные finance/auth-сценарии дополнять integration-тестами с БД.
