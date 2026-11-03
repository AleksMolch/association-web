"use client";

/**
 * demo-trainer.tsx — демонстрация трёх карточек без записи на сервер.
 *
 * Пользователь выбирает более близкую ассоциацию, затем видит итог и CTA
 * сохранить прогресс. Демо ничего не пишет в localStorage.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { demoWords, imageUrl } from "@/content";
import { cn } from "@/lib/utils";

export function DemoTrainer() {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const word = demoWords[index];
  const picked = word ? picks[word.id] : undefined;

  if (done) {
    const chosen = demoWords
      .map((item) => ({
        word: item,
        mnemonic: item.mnemonics.find((m) => m.id === picks[item.id]),
      }))
      .filter((item) => item.mnemonic);

    return (
      <Card className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Check className="size-7" aria-hidden="true" />
        </div>
        <h2 className="font-serif text-3xl font-semibold text-ink">Демо пройдено</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Вы выбрали три связки. Зарегистрируйтесь, чтобы сохранить прогресс, получать
          повторения по FSRS и синхронизировать слова с мобильным приложением.
        </p>
        <div className="mt-5 space-y-2 text-left">
          {chosen.map(({ word: item, mnemonic }) => (
            <div key={item.id} className="rounded-xl border border-line p-3">
              <p className="font-semibold text-ink">{item.lemma} · {item.meanings[0]}</p>
              <p className="text-sm text-muted">Ключ: {mnemonic?.cueWord}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/register" className={buttonVariants({ size: "lg" })}>
            Сохранить прогресс <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Button variant="secondary" onClick={() => { setPicks({}); setIndex(0); setDone(false); }}>
            Пройти заново
          </Button>
        </div>
      </Card>
    );
  }

  if (!word) {
    return <p className="text-center text-muted">Демо-карточки не найдены.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Badge variant="primary">Демо · {index + 1} из {demoWords.length}</Badge>
        <div className="w-40">
          <Progress value={index + 1} max={demoWords.length} label="Прогресс демо" />
        </div>
      </div>

      <Card className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-serif text-4xl font-semibold text-ink">{word.lemma}</h2>
          <span className="text-sm text-muted">{word.ipa}</span>
          <span className="text-base text-ink">{word.meanings[0]}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Какая связка понятнее лично вам? Выберите одну — это демо, поэтому нет
          «правильного» ответа.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {word.mnemonics.map((mnemonic) => {
            const active = picked === mnemonic.id;
            return (
              <button
                key={mnemonic.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPicks((prev) => ({ ...prev, [word.id]: mnemonic.id }))}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-surface text-left transition-colors",
                  active ? "border-primary ring-2 ring-primary/20" : "border-line hover:border-primary/50",
                )}
              >
                <span className="relative block aspect-[4/3] bg-paper-warm">
                  <Image
                    src={imageUrl(mnemonic.image)}
                    alt={`Ассоциация: ${mnemonic.sceneText}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 360px"
                    className="object-cover"
                  />
                </span>
                <span className="block space-y-1 p-4">
                  <Badge variant="coral">Ключ: {mnemonic.cueWord}</Badge>
                  <span className="block text-sm leading-relaxed text-ink">{mnemonic.sceneText}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">Выбор нигде не сохраняется.</p>
          <Button
            disabled={!picked}
            onClick={() => {
              if (index + 1 >= demoWords.length) setDone(true);
              else setIndex(index + 1);
            }}
          >
            {index + 1 >= demoWords.length ? "Показать итог" : "Дальше"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
