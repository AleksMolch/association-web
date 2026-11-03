"use client";

/**
 * page.tsx — обзор личного кабинета.
 *
 * Показывает локальный прогресс гостя, дневной план, следующее слово,
 * сложные слова и быстрые переходы. Для авторизованного пользователя этот
 * экран станет точкой входа в облачный прогресс.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Flame, Layers, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProgressChart } from "@/components/dashboard/progress-chart";
import { SyncLocal } from "@/components/dashboard/sync-local";
import { getWord, imageUrl, primaryMnemonic } from "@/content";
import { useGuest } from "@/lib/guest-store";

export default function DashboardPage() {
  const { ready, stats, settings, session, newWords } = useGuest();

  if (!ready) {
    return <p className="text-sm text-muted">Загружаем локальный прогресс…</p>;
  }

  const nextWord = newWords[0];
  const nextMnemonic = nextWord ? primaryMnemonic(nextWord) : undefined;
  const goalProgress = settings.dailyGoal > 0 ? (stats.newToday / settings.dailyGoal) * 100 : 0;

  return (
    <div className="space-y-6">
      <SyncLocal />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Личный кабинет · локальный прогресс</p>
          <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Обзор</h1>
        </div>
        <Badge variant="outline">FSRS · 1480 слов</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Flame, label: "Серия", value: `${stats.streak} дн.`, hint: "подряд" },
          { icon: Target, label: "К повторению", value: String(stats.dueNow), hint: "сейчас" },
          { icon: BookOpen, label: "Изучается", value: String(stats.introduced), hint: "слов" },
          { icon: Layers, label: "Новых сегодня", value: `${stats.newToday}/${settings.dailyGoal}`, hint: "цель" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xs text-muted">{item.label}</span>
                <span className="block font-serif text-2xl font-semibold text-ink">{item.value}</span>
                <span className="block text-[11px] text-muted">{item.hint}</span>
              </span>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-3">
          <CardHeader>
            <CardTitle>План на сегодня</CardTitle>
            <CardDescription>
              Новых слов: {stats.newToday} из {settings.dailyGoal}. В очереди занятия: {session.length}.
            </CardDescription>
          </CardHeader>
          <Progress value={goalProgress} label="Дневная цель" />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link
              href="/train"
              className={buttonVariants({ size: "lg", className: session.length ? "" : "pointer-events-none opacity-45" })}
              aria-disabled={session.length === 0}
            >
              Начать занятие <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/dashboard/settings" className={buttonVariants({ variant: "ghost" })}>
              Изменить цель
            </Link>
          </div>
        </Card>

        {nextWord && nextMnemonic ? (
          <Card className="space-y-3">
            <CardHeader>
              <CardTitle className="text-lg">Следующее новое слово</CardTitle>
              <CardDescription>Можно посмотреть до занятия.</CardDescription>
            </CardHeader>
            <Link href={`/dashboard/words/${nextWord.id}`} className="flex items-center gap-3 rounded-xl border border-line p-2 hover:bg-paper-warm">
              <Image
                src={imageUrl(nextMnemonic.image)}
                alt={`Иллюстрация к ${nextWord.lemma}`}
                width={96}
                height={72}
                className="h-[72px] w-24 rounded-lg object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-xl font-semibold text-ink">{nextWord.lemma}</span>
                <span className="block truncate text-xs text-muted">{nextWord.meanings[0]}</span>
                <span className="block truncate text-xs font-semibold text-primary">Ключ: {nextMnemonic.cueWord}</span>
              </span>
            </Link>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Повторения за 7 дней</CardTitle>
            <CardDescription>Оценённые карточки по дням.</CardDescription>
          </CardHeader>
          <ProgressChart days={stats.lastSevenDays} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Сложные слова</CardTitle>
            <CardDescription>Три и более срыва.</CardDescription>
          </CardHeader>
          {stats.leeches.length === 0 ? (
            <p className="text-sm text-muted">Пока нет слов с частыми срывами.</p>
          ) : (
            <ul className="space-y-2">
              {stats.leeches.slice(0, 5).map((card) => {
                const word = getWord(card.wordId);
                if (!word) return null;
                return (
                  <li key={card.id}>
                    <Link href={`/dashboard/words/${word.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-warm">
                      <span className="truncate text-sm text-ink">{word.lemma}</span>
                      <span className="text-xs font-semibold text-coral">{card.lapses}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/words" className={buttonVariants({ variant: "secondary" })}>Все слова</Link>
        <Link href="/dashboard/progress" className={buttonVariants({ variant: "secondary" })}>Подробный прогресс</Link>
        <Link href="/dashboard/billing" className={buttonVariants({ variant: "secondary" })}>VIP и оплата</Link>
      </div>
    </div>
  );
}
