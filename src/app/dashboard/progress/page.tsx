"use client";

/**
 * page.tsx — подробный прогресс гостя.
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProgressChart } from "@/components/dashboard/progress-chart";
import { getWord } from "@/content";
import { stateLabel } from "@/lib/fsrs";
import { useGuest } from "@/lib/guest-store";

export default function DashboardProgressPage() {
  const { ready, stats } = useGuest();

  if (!ready) return <p className="text-sm text-muted">Загружаем прогресс…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Локальная статистика</p>
          <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Прогресс</h1>
        </div>
        <Badge variant="outline">Без аккаунта · только это устройство</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Изучается", String(stats.introduced)],
          ["К повторению", String(stats.dueNow)],
          ["Серия", `${stats.streak} дн.`],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs text-muted">{label}</p>
            <p className="font-serif text-3xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Повторения за 7 дней</CardTitle>
          <CardDescription>Сколько карточек вы оценили каждый день.</CardDescription>
        </CardHeader>
        <ProgressChart days={stats.lastSevenDays} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Состояния FSRS</CardTitle>
          <CardDescription>Распределение карточек по стадиям.</CardDescription>
        </CardHeader>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((state) => {
            const count = stats.stateCounts[state] ?? 0;
            const value = stats.introduced > 0 ? (count / stats.introduced) * 100 : 0;
            return (
              <div key={state} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-ink">{stateLabel(state)}</span>
                  <span className="text-muted">{count}</span>
                </div>
                <Progress value={value} label={stateLabel(state)} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Сложные слова</CardTitle>
          <CardDescription>Карточки с тремя и более срывами.</CardDescription>
        </CardHeader>
        {stats.leeches.length === 0 ? (
          <p className="text-sm text-muted">Пока нет слов с частыми срывами.</p>
        ) : (
          <ul className="space-y-1">
            {stats.leeches.map((card) => {
              const word = getWord(card.wordId);
              if (!word) return null;
              return (
                <li key={card.id}>
                  <Link href={`/dashboard/words/${word.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-paper-warm">
                    <span className="text-sm text-ink">{word.lemma} · {word.meanings[0]}</span>
                    <span className="text-xs font-semibold text-coral">срывов: {card.lapses}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>Назад в кабинет</Link>
    </div>
  );
}
