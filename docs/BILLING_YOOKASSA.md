# ЮKassa

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
- `Idempotence-Key` генерируется на сервере и хранится в `payments.idempotence_key`.
- `metadata` содержит paymentId, userId, planId.
- При ошибке ЮKassa платёж помечается `failed`.
- `confirmation_url` сохраняется в БД.

## Webhook

- URL: `/api/billing/webhook`.
- События: `payment.succeeded`, `payment.canceled`.
- VIP активирует только `succeeded`.
- Повторный `succeeded` не создаёт новую подписку: update по `status != succeeded` возвращает 0 строк.
- `payment.canceled` не отменяет уже активную подписку.
- При `YOOKASSA_TRUSTED_IPS` проверяется точный IP из `x-forwarded-for`/`x-real-ip`.
- Ответ 500 заставляет ЮKassa повторить доставку.

## Продление

- Срок добавляется к `max(now, текущий ends_at)`.
- `addMonths` сохраняет день месяца; 31-е в коротком месяце становится последним днём.
- Автосписание не реализовано. Кнопка «Продлить» создаёт новый разовый платёж.

## Возвраты

В UI не реализованы. Порядок:

1. Найти `provider_payment_id` в `payments`.
2. Создать возврат в API ЮKassa.
3. Обновить `payments.status = refunded`.
4. Пересчитать/отозвать подписку.
5. Записать audit_log.
6. Уведомить пользователя.

## Тестовый магазин

1. Включите тестовый режим в личном кабинете ЮKassa.
2. Используйте тестовые карты из документации.
3. Проверьте success, cancel и повторный webhook.
4. Проверьте, что return URL без webhook не активирует VIP.

## Runbook инцидента

| Симптом | Действие |
| --- | --- |
| Платёж succeeded, VIP нет | проверить логи webhook, `provider_payment_id`, статус payments |
| VIP есть, денег нет | проверить, не тестовый ли магазин; сверить с ЮKassa |
| Двойное продление | проверить уникальность provider_payment_id и статус платежа |
| Webhook 403 | проверить `YOOKASSA_TRUSTED_IPS` и прокси-заголовки |
| Webhook 500 | смотреть `[billing:webhook]`; повторить доставку вручную |
