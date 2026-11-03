"use client";

/**
 * session-runner.tsx — карточка текущего шага занятия.
 *
 * Новое слово: перевод, выбор ассоциации, «Проверь себя».
 * Повторение: вопрос → подсказка/ответ → оценка FSRS → интервал.
 * Компонент получает key по номеру шага, поэтому локальное состояние
 * сбрасывается без setState внутри эффекта.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Keyboard, Lightbulb, Volume2 } from "lucide-react";

import { getMnemonic, getWord, imageUrl, primaryMnemonic } from "@/content";
import type { Mnemonic } from "@/content/types";
import { applyRating, formatNextReview } from "@/lib/fsrs";
import type { CardRow, RatingValue, SessionItem } from "@/lib/types";
import { useGuest } from "@/lib/guest-store";
import { speakEnglish } from "@/lib/speech";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const RATINGS: { value: RatingValue; label: string; variant: "coral" | "secondary" | "primary" | "secondary" }[] = [
  { value: 1, label: "Again", variant: "coral" },
  { value: 2, label: "Hard", variant: "secondary" },
  { value: 3, label: "Good", variant: "primary" },
  { value: 4, label: "Easy", variant: "secondary" },
];

function MnemonicOption({
  mnemonic,
  index,
  total,
  active,
  onSelect,
}: {
  mnemonic: Mnemonic;
  index: number;
  total: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface text-left transition-colors",
        active ? "border-primary ring-2 ring-primary/20" : "border-line hover:border-primary/50",
      )}
    >
      <span className="relative block aspect-[4/3] bg-paper-warm">
        <Image
          src={imageUrl(mnemonic.image)}
          alt={`Иллюстрация: ${mnemonic.sceneText}`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover"
        />
      </span>
      <span className="block space-y-1 p-4">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="coral">Ключ: {mnemonic.cueWord}</Badge>
          <span className="text-xs text-muted">Вариант {index + 1} из {total}</span>
        </span>
        <span className="block text-sm leading-relaxed text-ink">{mnemonic.sceneText}</span>
      </span>
    </button>
  );
}

export function SessionRunner({
  item,
  index,
  total,
  onNext,
}: {
  item: SessionItem;
  index: number;
  total: number;
  onNext: (kind: SessionItem["kind"]) => void;
}) {
  const { settings, cardByWord, preferred, selectMnemonic, rateCard } = useGuest();
  const word = getWord(item.wordId);
  const card = cardByWord.get(item.wordId);
  const preferredMnemonic = word ? getMnemonic(word, preferred.get(word.id)) : undefined;
  const reviewMnemonic = preferredMnemonic ?? (word ? primaryMnemonic(word) : undefined);
  const mnemonics = word ? [...word.mnemonics].sort((a, b) => a.sortOrder - b.sortOrder) : [];

  const [phase, setPhase] = useState<"deck" | "check" | "question" | "answer" | "rated">(
    item.kind === "new" ? "deck" : "question",
  );
  const [deckIndex, setDeckIndex] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [updatedCard, setUpdatedCard] = useState<CardRow | null>(null);

  const deckMnemonic = mnemonics[deckIndex] ?? mnemonics[0];
  const translation = word?.meanings[0] ?? "";

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (item.kind === "new" && phase === "deck") {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setDeckIndex((prev) => Math.min(mnemonics.length - 1, prev + 1));
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          setDeckIndex((prev) => Math.max(0, prev - 1));
        } else if (event.key === "Enter" && deckMnemonic) {
          event.preventDefault();
          selectMnemonic(item.wordId, deckMnemonic.id, "initial");
          setPhase("check");
        }
        return;
      }

      if (item.kind === "review" && phase === "question") {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          setPhase("answer");
        } else if (event.key.toLowerCase() === "h" && settings.hintsEnabled) {
          event.preventDefault();
          setHintShown(true);
          setUsedHint(true);
        }
        return;
      }

      if (item.kind === "review" && phase === "answer") {
        const rating = RATINGS.find((entry) => String(entry.value) === event.key);
        if (rating) {
          event.preventDefault();
          const result = rateCard(item.wordId, rating.value, usedHint);
          setUpdatedCard(result);
          setPhase("rated");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [item, phase, deckMnemonic, mnemonics.length, selectMnemonic, settings.hintsEnabled, rateCard, usedHint]);

  if (!word) {
    return (
      <Card>
        <p className="text-muted">Слово не найдено.</p>
        <Button className="mt-4" onClick={() => onNext(item.kind)}>Пропустить</Button>
      </Card>
    );
  }

  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  const predictions = card
    ? RATINGS.map((entry) => ({
        ...entry,
        interval: formatNextReview(applyRating(card, entry.value, new Date()).due),
      }))
    : [];

  if (item.kind === "new") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="primary">Новое слово</Badge>
          <div className="flex-1">
            <Progress value={progress} label="Прогресс занятия" />
          </div>
          <span className="text-xs tabular-nums text-muted">{index + 1} / {total}</span>
        </div>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">{word.lemma}</h2>
            <span className="text-sm text-muted">{word.ipa} · {word.ruPronunciation}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Произнести ${word.lemma}`}
              onClick={() => speakEnglish(word.lemma, settings.ttsRate)}
            >
              <Volume2 className="size-5" />
            </Button>
          </div>
          <p className="text-lg text-ink">{translation}</p>

          {phase === "check" && deckMnemonic ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary-soft p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Check className="size-4" aria-hidden="true" /> Проверь себя
                </p>
                <p className="mt-1 text-sm text-ink">
                  Свяжите ключ «{deckMnemonic.cueWord}» с переводом «{translation}».
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MnemonicOption
                  mnemonic={deckMnemonic}
                  index={deckIndex}
                  total={mnemonics.length}
                  active
                  onSelect={() => undefined}
                />
                <div className="rounded-xl border border-line p-4 text-sm leading-relaxed text-muted">
                  {deckMnemonic.sceneText}
                </div>
              </div>
              <Button onClick={() => onNext("new")}>Понятно, дальше</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">Выберите ассоциацию, которая понятнее лично вам.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {mnemonics.map((mnemonic, mnemonicIndex) => (
                  <MnemonicOption
                    key={mnemonic.id}
                    mnemonic={mnemonic}
                    index={mnemonicIndex}
                    total={mnemonics.length}
                    active={mnemonicIndex === deckIndex}
                    onSelect={() => setDeckIndex(mnemonicIndex)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={!deckMnemonic}
                  onClick={() => {
                    if (!deckMnemonic) return;
                    selectMnemonic(item.wordId, deckMnemonic.id, "initial");
                    setPhase("check");
                  }}
                >
                  Выбрать «{deckMnemonic?.cueWord ?? "ассоциацию"}»
                </Button>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Keyboard className="size-3.5" /> ← → выбрать, Enter подтвердить
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (!card) {
    return (
      <Card>
        <p className="text-muted">Карточка не найдена. Возможно, прогресс был очищен.</p>
        <Button className="mt-4" onClick={() => onNext("review")}>Пропустить</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant="primary">Повторение</Badge>
        <div className="flex-1">
          <Progress value={progress} label="Прогресс занятия" />
        </div>
        <span className="text-xs tabular-nums text-muted">{index + 1} / {total}</span>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">{word.lemma}</h2>
          <span className="text-sm text-muted">{word.ipa} · {word.ruPronunciation}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Произнести ${word.lemma}`}
            onClick={() => speakEnglish(word.lemma, settings.ttsRate)}
          >
            <Volume2 className="size-5" />
          </Button>
        </div>

        {phase === "question" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Вспомните перевод. При необходимости откройте подсказку.</p>
            {hintShown && reviewMnemonic ? (
              <div className="rounded-xl border border-line p-4">
                <Badge variant="coral">Ключ: {reviewMnemonic.cueWord}</Badge>
                <p className="mt-2 text-sm leading-relaxed text-ink">{reviewMnemonic.sceneText}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {settings.hintsEnabled && !hintShown ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setHintShown(true);
                    setUsedHint(true);
                  }}
                >
                  <Lightbulb className="size-4" aria-hidden="true" /> Показать подсказку
                </Button>
              ) : null}
              <Button onClick={() => setPhase("answer")}>Показать ответ</Button>
            </div>
            <p className="text-xs text-muted">Space — ответ, H — подсказка.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Перевод</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{translation}</p>
            </div>
            {reviewMnemonic ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <MnemonicOption
                  mnemonic={reviewMnemonic}
                  index={0}
                  total={1}
                  active
                  onSelect={() => undefined}
                />
                <div className="rounded-xl border border-line p-4">
                  <Badge variant="coral">Ключ: {reviewMnemonic.cueWord}</Badge>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{reviewMnemonic.sceneText}</p>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted">
                    {usedHint ? "Использована подсказка" : "Ответ открыт самостоятельно"}
                  </p>
                </div>
              </div>
            ) : null}

            {phase === "rated" && updatedCard ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-primary/30 bg-primary-soft p-4">
                  <p className="text-sm font-semibold text-primary">
                    Следующий повтор: {formatNextReview(updatedCard.due)}
                  </p>
                </div>
                <Button onClick={() => onNext("review")}>Дальше</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-4">
                  {predictions.map((entry) => (
                    <Button
                      key={entry.value}
                      variant={entry.variant}
                      className="h-auto flex-col items-start gap-0.5 py-3"
                      onClick={() => {
                        const result = rateCard(item.wordId, entry.value, usedHint);
                        setUpdatedCard(result);
                        setPhase("rated");
                      }}
                    >
                      <span>{entry.label}</span>
                      <span className="text-[11px] font-normal opacity-80">{entry.interval}</span>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted">1–4 — оценка. Подсказка не считается ответом.</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
