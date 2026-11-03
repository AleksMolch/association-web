"use client";

/**
 * trainer.tsx — оболочка занятия.
 *
 * Очередь строится один раз при монтировании, сохраняется в sessionStorage и
 * восстанавливается после перезагрузки. Оценки и новые карточки сразу пишутся
 * в guest-store.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { getWord } from "@/content";
import { useGuest } from "@/lib/guest-store";
import type { SessionItem } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SessionRunner } from "@/components/study/session-runner";

const SESSION_KEY = "association_web_session_v1";

type TrainerState = {
  queue: SessionItem[];
  index: number;
  counts: { reviews: number; introduced: number };
  finished: boolean;
};

function loadInitialState(fallback: SessionItem[]): TrainerState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as TrainerState;
        const valid = Array.isArray(saved.queue)
          ? saved.queue.filter((item) => item && getWord(item.wordId))
          : [];
        if (valid.length) {
          const index = Math.min(saved.index ?? 0, valid.length - 1);
          return {
            queue: valid,
            index,
            counts: saved.counts ?? { reviews: 0, introduced: 0 },
            finished: (saved.index ?? 0) >= valid.length,
          };
        }
      }
    } catch {
      // повреждённая сессия просто пересобирается
    }
  }
  return { queue: fallback, index: 0, counts: { reviews: 0, introduced: 0 }, finished: fallback.length === 0 };
}

function TrainerSession({ initialSession }: { initialSession: SessionItem[] }) {
  const [state, setState] = useState<TrainerState>(() => loadInitialState(initialSession));
  const { queue, index, counts, finished } = state;

  useEffect(() => {
    try {
      if (finished) window.sessionStorage.removeItem(SESSION_KEY);
      else window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage может быть недоступен в приватном режиме
    }
  }, [state, finished]);

  const next = (kind: SessionItem["kind"]) => {
    setState((previous) => {
      const nextCounts = {
        reviews: previous.counts.reviews + (kind === "review" ? 1 : 0),
        introduced: previous.counts.introduced + (kind === "new" ? 1 : 0),
      };
      if (previous.index + 1 >= previous.queue.length) {
        return { ...previous, counts: nextCounts, finished: true };
      }
      return { ...previous, counts: nextCounts, index: previous.index + 1 };
    });
  };

  if (finished) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden="true" />
        <h1 className="mt-3 font-serif text-3xl font-semibold text-ink">Занятие завершено</h1>
        <p className="mt-2 text-sm text-muted">
          Повторений: {counts.reviews} · новых слов: {counts.introduced}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>В кабинет</Link>
          <Button
            variant="secondary"
            onClick={() =>
              setState({
                queue: initialSession,
                index: 0,
                counts: { reviews: 0, introduced: 0 },
                finished: initialSession.length === 0,
              })
            }
          >
            Ещё занятие
          </Button>
        </div>
      </Card>
    );
  }

  if (!queue.length) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="font-serif text-3xl font-semibold text-ink">На сегодня всё</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Нет слов к повторению и новых карточек в пределах дневной цели. Можно
          изменить цель в настройках или вернуться позже.
        </p>
        <Link href="/dashboard" className={buttonVariants({ className: "mt-5" })}>
          Вернуться в кабинет
        </Link>
      </Card>
    );
  }

  const item = queue[index];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" aria-hidden="true" /> В кабинет
        </Link>
        <p className="text-sm text-muted">
          Занятие · {index + 1} из {queue.length}
        </p>
      </div>
      <SessionRunner
        key={`${item.kind}-${item.wordId}-${index}`}
        item={item}
        index={index}
        total={queue.length}
        onNext={next}
      />
    </div>
  );
}

export function Trainer() {
  const { ready, session } = useGuest();

  if (!ready) {
    return (
      <Card>
        <p className="text-sm text-muted">Готовим карточки…</p>
      </Card>
    );
  }

  return <TrainerSession initialSession={session} />;
}
