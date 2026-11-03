"use client";

/**
 * page.tsx — настройки гостя.
 *
 * Дневная цель, подсказки, reduced motion, скорость озвучки и очистка
 * локального прогресса. После входа эти же настройки будут храниться в БД.
 */

import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuest } from "@/lib/guest-store";
import type { Settings } from "@/lib/types";

const GOALS: Settings["dailyGoal"][] = [5, 10, 15, 20];
const RATES = [0.8, 0.95, 1.1];

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line p-4">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-5 accent-[var(--color-primary)]"
      />
    </label>
  );
}

export default function DashboardSettingsPage() {
  const { ready, settings, stats, updateSettings, reset } = useGuest();

  if (!ready) return <p className="text-sm text-muted">Загружаем настройки…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted">Локальные настройки · это устройство</p>
        <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Настройки</h1>
      </div>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Новые слова в день</CardTitle>
          <CardDescription>Сколько новых слов добавлять в занятие. Повторения не ограничены.</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Дневная цель">
          {GOALS.map((goal) => (
            <Button
              key={goal}
              variant={settings.dailyGoal === goal ? "primary" : "secondary"}
              aria-pressed={settings.dailyGoal === goal}
              onClick={() => updateSettings({ dailyGoal: goal })}
            >
              {goal}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Обучение</CardTitle>
          <CardDescription>Поведение карточек и интерфейса.</CardDescription>
        </CardHeader>
        <Toggle
          label="Подсказки при повторении"
          description="Кнопка «Показать подсказку» и клавиша H. Использованная подсказка отмечается в отзыве."
          checked={settings.hintsEnabled}
          onChange={(hintsEnabled) => updateSettings({ hintsEnabled })}
        />
        <Toggle
          label="Меньше движения"
          description="Отключает декоративные анимации, если они мешают."
          checked={settings.reducedMotion}
          onChange={(reducedMotion) => updateSettings({ reducedMotion })}
        />
      </Card>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Озвучка</CardTitle>
          <CardDescription>Скорость произношения английского слова.</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Скорость озвучки">
          {RATES.map((rate) => (
            <Button
              key={rate}
              variant={settings.ttsRate === rate ? "primary" : "secondary"}
              aria-pressed={settings.ttsRate === rate}
              onClick={() => updateSettings({ ttsRate: rate })}
            >
              {rate === 1.1 ? "быстро" : rate === 0.8 ? "медленно" : "обычно"}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <CardHeader>
          <CardTitle>Аккаунт и данные</CardTitle>
          <CardDescription>
            Сейчас прогресс хранится только в этом браузере. Войдите, чтобы
            сохранить его в облаке и синхронизировать между устройствами.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Link href="/register" className={buttonVariants()}>Создать аккаунт</Link>
          <Link href="/login" className={buttonVariants({ variant: "secondary" })}>Войти</Link>
          <Link href="/dashboard/billing" className={buttonVariants({ variant: "ghost" })}>VIP</Link>
        </div>
      </Card>

      <Card className="space-y-4 border-coral/30">
        <CardHeader>
          <CardTitle>Очистить локальный прогресс</CardTitle>
          <CardDescription>
            Удаляет карточки, выбранные ассоциации и настройки на этом устройстве.
            Словарь и изображения остаются. Действие нельзя отменить.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="coral"
            onClick={() => {
              if (!window.confirm("Удалить весь локальный прогресс на этом устройстве?")) return;
              reset();
              try {
                window.sessionStorage.removeItem("association_web_session_v1");
              } catch {
                // ignore
              }
              toast.success("Локальный прогресс очищен");
            }}
          >
            Очистить прогресс
          </Button>
          <span className="text-xs text-muted">
            Изучается: {stats.introduced} из {stats.totalWords}
          </span>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge variant="outline">Гостевое хранилище</Badge>
        <span>association_guest_v1 · localStorage</span>
        <span className="hidden sm:inline">·</span>
        <span>Словарь: {stats.totalWords} слов</span>
      </div>
    </div>
  );
}
