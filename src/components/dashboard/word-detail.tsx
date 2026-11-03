"use client";

/**
 * word-detail.tsx — карточка слова в кабинете.
 *
 * Показывает все ассоциации и позволяет выбрать или заменить ключ. Для нового
 * слова выбор создаёт FSRS-карточку; для изученного — меняет ассоциацию.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWord, imageUrl } from "@/content";
import { formatNextReview, stateLabel } from "@/lib/fsrs";
import { useGuest } from "@/lib/guest-store";
import { speakEnglish } from "@/lib/speech";
import { cn } from "@/lib/utils";

export function WordDetail({ wordId }: { wordId: number }) {
  const word = getWord(wordId);
  const { ready, settings, cardByWord, preferred, selectMnemonic } = useGuest();

  if (!word) {
    return (
      <Card className="text-center">
        <h1 className="font-serif text-2xl font-semibold text-ink">Слово не найдено</h1>
        <Link href="/dashboard/words" className={buttonVariants({ className: "mt-4" })}>К списку слов</Link>
      </Card>
    );
  }

  if (!ready) return <p className="text-sm text-muted">Загружаем слово…</p>;

  const card = cardByWord.get(word.id);
  const activeId = preferred.get(word.id);
  const mode = card ? "replace" : "initial";

  return (
    <div className="space-y-5">
      <Link href="/dashboard/words" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Все слова
      </Link>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-serif text-4xl font-semibold text-ink">{word.lemma}</h1>
            <span className="text-sm text-muted">{word.ipa}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Произнести ${word.lemma}`}
              onClick={() => speakEnglish(word.lemma, settings.ttsRate)}
            >
              <Volume2 className="size-5" />
            </Button>
          </div>
          <p className="text-lg text-ink">{word.meanings.join("; ")}</p>
          <p className="text-xs text-muted">Произношение: {word.ruPronunciation}</p>

          <div className="rounded-xl border border-line p-3 text-sm">
            {card ? (
              <div className="space-y-1">
                <p className="font-semibold text-ink">Карточка: {stateLabel(card.state)}</p>
                <p className="text-muted">
                  Следующий повтор: {formatNextReview(card.due)} · повторов: {card.reps} · срывов: {card.lapses}
                </p>
              </div>
            ) : (
              <p className="text-muted">
                Слово ещё не изучается. Выбор ассоциации создаст карточку и добавит слово в занятия.
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <CardHeader>
            <CardTitle className="text-lg">Быстрые действия</CardTitle>
            <CardDescription>Ассоциацию можно менять в любое время.</CardDescription>
          </CardHeader>
          <Link href="/train" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
            Перейти к занятию
          </Link>
          <p className="text-xs leading-relaxed text-muted">
            При замене ключа карточка сохраняет историю повторений. Новый ключ
            начнёт использоваться со следующего показа.
          </p>
        </Card>
      </div>

      <section aria-labelledby="associations-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="associations-heading" className="font-serif text-2xl font-semibold text-ink">Ассоциации</h2>
            <p className="text-sm text-muted">Выберите ключ, который понятнее лично вам.</p>
          </div>
          <Badge variant="outline">{word.mnemonics.length} вариант(а/ов)</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {word.mnemonics.map((mnemonic) => {
            const active = activeId === mnemonic.id;
            return (
              <Card
                key={mnemonic.id}
                className={cn("overflow-hidden", active && "border-primary ring-2 ring-primary/20")}
              >
                <div className="relative aspect-[4/3] bg-paper-warm">
                  <Image
                    src={imageUrl(mnemonic.image)}
                    alt={`Иллюстрация: ${mnemonic.sceneText}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 420px"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="coral">Ключ: {mnemonic.cueWord}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-ink">{mnemonic.sceneText}</p>
                  <Button
                    variant={active ? "secondary" : "primary"}
                    disabled={active}
                    onClick={() => {
                      selectMnemonic(word.id, mnemonic.id, mode);
                      toast.success(
                        mode === "initial"
                          ? `Слово «${word.lemma}» добавлено в занятия`
                          : `Ассоциация для «${word.lemma}» заменена`,
                      );
                    }}
                  >
                    {active ? <><Check className="size-4" /> Выбрана</> : mode === "initial" ? "Выбрать и добавить" : "Заменить на эту"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
