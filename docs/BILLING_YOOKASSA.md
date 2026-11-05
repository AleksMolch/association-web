# ЮKassa

Интеграция проверена по документации ЮKassa (API v3 и HTTP-уведомления) 2026-11-05. Текущий scope — только разовые платежи с redirect-подтверждением; поведение billing не менялось.

## Последовательность

```
Browser -> POST /api/billing/create-payment {planCode}
Server  -> plans.ts: amount, duration
Server  -> INSERT payments (pending)
Server  -> POST https://api.yookassa.ru/v3/payments (Idempotence-Key)
YooKassa-> confirmation_url
Browser -> redirect confirmation_url
User    -> оплата
YooKassa-> POST /api/billing/webhook payment.succeeded
Server  -> UPDATE payments (succeeded, paid_at)
Server  -> INSERT subscriptions (ends_at += months)
Server  -> INSERT audit_log
Browser -> /dashboard/billing/return?paymentId=...
Server  -> GET /api/billing/status -> active subscription
```

## Создание платежа

- Клиент передаёт только `planCode` и опциональный same-origin `returnUrl`.
- Сумма, валюта и срок берутся из `src/lib/billing/plans.ts`.
- Запрос: `POST /v3/payments` с `capture: true`, `confirmation.type = redirect`, суммой в RUB и `metadata`.
- `Idempotence-Key` генерируется на сервере и хранится в `payments.idempotence_key`.
- `metadata` содержит `paymentId`, `userId`, `planId`, `customerEmail`.
- При ошибке ЮKassa платёж помечается `failed`.
- `confirmation_url` сохраняется в БД.
- Return URL не считается подтверждением оплаты.

## Webhook

- URL: `/api/billing/webhook`.
- Обрабатываются события `payment.succeeded` и `payment.canceled`.
- VIP активирует только `succeeded`.
- Повторный `succeeded` не создаёт новую подписку: update по `status != succeeded` возвращает 0 строк.
- `payment.canceled` не отменяет уже активную подписку.
- Ответ 200 подтверждает доставку; ответ 500 заставляет ЮKassa повторить доставку.
- Тело уведомления содержит `type`, `event`, `object`; код читает `event` и `object.id/status`.

### Проверка подлинности

Сейчас доступна только необязательная проверка IP: `YOOKASSA_TRUSTED_IPS` сравнивает точный адрес из `x-forwarded-for`/`x-real-ip`. Официальная документация рекомендует также перепроверять статус объекта через `GET /v3/payments/{payment_id}`.

Ограничения текущей реализации:

- заголовка подписи у ЮKassa нет; криптографической проверки тела нет;
- официальные диапазоны ЮKassa заданы в CIDR, а код умеет сравнивать только точные адреса;
- если `YOOKASSA_TRUSTED_IPS` пуст, проверка подлинности уведомления не выполняется;
- статус платежа не перепроверяется через API перед активацией VIP.

Официальные диапазоны из документации:

```
185.71.76.0/27
185.71.77.0/27
77.75.153.0/25
77.75.156.11
77.75.156.35
77.75.154.128/25
2a02:5180::/32
```

До добавления CIDR-поддержки указывайте только отдельные адреса из этих диапазонов или оставляйте allowlist пустым и полагайтесь на HTTPS.

## Проверка активной подписки

- `getActiveSubscription` — единственное место с фильтром `status = active` и `ends_at > now`.
- Истёкшие и отменённые подписки возвращаются как отсутствующие; `hasVip` и `requireVip` только делегируют результат.

## Продление

- Срок добавляется к `max(now, текущий ends_at)`.
- `addMonths` сохраняет день месяца; 31-е в коротком месяце становится последним днём.
- Автосписание не реализовано. Кнопка «Продлить» создаёт новый разовый платёж.

## Возвраты

В UI и API приложения не реализованы. По документации ЮKassa возврат создаётся через `POST /v3/refunds` с `payment_id`, суммой и `Idempotence-Key`; возможны полный и частичный возвраты, срок зависит от способа оплаты (для большинства — 3 года).

Ручной порядок:

1. Найти `provider_payment_id` в `payments`.
2. Создать возврат в API ЮKassa.
3. Обновить `payments.status = refunded`.
4. Пересчитать/отозвать подписку.
5. Записать `audit_log`.
6. Уведомить пользователя.

Событие `refund.succeeded` сейчас не обрабатывается.

## Тестовый магазин

1. Включите тестовый режим в личном кабинете ЮKassa.
2. Используйте тестовые карты из документации.
3. Проверьте success, cancel и повторный webhook.
4. Проверьте, что return URL без webhook не активирует VIP.

## Follow-ups, не входящие в текущий scope

| Тема | Что отсутствует |
| --- | --- |
| Рекуррентные платежи | сохранение способа оплаты, `payment_method_id`, автоплатежи, уведомления об автоплатежах |
| Возвраты | UI/API возврата, обработка `refund.succeeded`, пересчёт подписки |
| Чеки 54-ФЗ | объекты `receipt` и настройка налогов |
| Проверка webhook | CIDR-allowlist и/или перепроверка статуса через `GET /v3/payments/{id}` |
| Отчётность | сверка платежей и возвратов с провайдером |

## Runbook инцидента

| Симптом | Действие |
| --- | --- |
| Платёж succeeded, VIP нет | проверить логи webhook, `provider_payment_id`, статус payments |
| VIP есть, денег нет | проверить, не тестовый ли магазин; сверить с ЮKassa |
| Двойное продление | проверить уникальность provider_payment_id и статус платежа |
| Webhook 403 | проверить `YOOKASSA_TRUSTED_IPS` и прокси-заголовки; помнить про CIDR |
| Webhook 500 | смотреть `[billing:webhook]`; повторить доставку вручную |
