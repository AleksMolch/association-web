# Дизайн-система

## Палитра

| Токен | Светлая | Тёмная | Назначение |
| --- | --- | --- | --- |
| `paper` | `#f5f7f7` | `#101515` | фон |
| `paper-warm` | `#f2efe8` | `#171d1c` | тёплые блоки |
| `surface` | `#ffffff` | `#182020` | карточки |
| `ink` | `#24282b` | `#f2f5f5` | текст |
| `muted` | `#6b7276` | `#a9b7b7` | вторичный текст |
| `line` | `#d9dede` | `#2c3838` | границы |
| `primary` | `#0f5f58` | `#4fb3a8` | действие |
| `primary-soft` | `#dceeea` | `#1c3431` | подложка |
| `coral` | `#a63e3c` | `#ef8b87` | акцент/опасность |
| `success` | `#26734d` | `#6cc49a` | успех |

Токены заданы в `src/app/globals.css` через `@theme`. Компоненты используют классы `bg-surface`, `text-ink`, `border-line`, а не hex.

## Типографика

- Sans: системный стек (`--font-sans`).
- Serif: `ui-serif, Georgia` (`--font-serif`).
- Заголовки — serif, крупные, с tight tracking.
- Основной текст — 16–18 px, `leading-relaxed`.
- Подписи — 12–14 px, `text-muted`.

## Отступы и радиусы

- Базовая сетка — 4 px.
- Карточки — `rounded-2xl`, padding 20 px.
- Кнопки — `rounded-xl`, высота 44–48 px.
- Контейнер — `max-w-6xl`, боковые 20/32 px.

## Компоненты

`src/components/ui`:

- `Button` — primary, secondary, ghost, coral, link; размеры sm/md/lg/icon.
- `Card` — поверхность, заголовок, описание.
- `Badge` — primary, coral, outline.
- `Input` — поле, label, error.
- `Progress` — доступный прогресс.
- `Accordion`, `Separator`.

Предметные:

- `SiteHeader`, `SiteFooter`;
- `SessionRunner`, `Trainer`;
- `ProgressChart`;
- `AccountMenu`, `SyncLocal`.

## Доступность

- Контраст текста и фона — не ниже AA для основного текста.
- Все интерактивные элементы доступны с клавиатуры.
- `:focus-visible` — 2 px primary.
- Иконки с `aria-hidden`, если рядом есть текст.
- Оценки FSRS имеют текстовые подписи и цифры 1–4.
- Прогресс имеет `aria-label`.
- Поддерживается `prefers-reduced-motion` и ручной переключатель.
- Формы используют label, `aria-invalid`, `role=alert`.

## Анимации

- Только короткие transition-colors.
- Нет параллакса и автопроигрывания.
- Reduced motion отключает анимации.

## Правила вдохновения

Не копировать чужие иллюстрации, тексты, логотипы и точные композиции. Использовать только общие принципы: воздух, крупная типографика, спокойная палитра, ясная иерархия.
