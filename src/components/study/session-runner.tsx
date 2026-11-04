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

import { getWord, imageUrl } from "@/content";
import type { Mnemonic } from "@/content/types";
import type { UserMnemonic } from "@/features/user-mnemonics/types";
import { LocalImage } from "@/features/user-mnemonics/components/local-image";
import { applyRating, formatNextReview } from "@/lib/fsrs";
import type { CardRow, RatingValue, SessionItem } from "@/lib/types";
import { useGuest, type ResolvedGuestMnemonic } from "@/lib/guest-store";
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

type MnemonicVariant =
  | { source: "builtin"; mnemonic: Mnemonic }
  | { source: "user"; mnemonic: UserMnemonic };

function toVariant(resolved: ResolvedGuestMnemonic): MnemonicVariant {
  return resolved.source === "user"
    ? { source: "user", mnemonic: resolved.mnemonic }
    : { source: "builtin", mnemonic: resolved.mnemonic };
}

function MnemonicOption({
  variant,
  index,
  total,
  active,
  onSelect,
}: {
  variant: MnemonicVariant;
  index: number;
  total: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { mnemonic } = variant;

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
        {variant.source === "user" ? (
          <LocalImage
            mnemonicId={mnemonic.id}
            alt={`Личная иллюстрация: ${mnemonic.sceneText}`}
          />
        ) : (
          <Image
            src={imageUrl(variant.mnemonic.image)}
            alt={`Иллюстрация: ${mnemonic.sceneText}`}
            fill
            sizes="(max-width: 768px) 100vw, 360px"
            className="object-cover"
          />
        )}
      </span>
      <span className="block space-y-1 p-4">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="coral">Ключ: {mnemonic.cueWord}</Badge>
          {variant.source === "user" ? <Badge variant="primary">Мой</Badge> : null}
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
  const { settings, cardByWord, activeUserMnemonics, resolveMnemonic, selectMnemonic, rateCard } = useGuest();
  const word = getWord(item.wordId);
  const card = cardByWord.get(item.wordId);
  const resolved = word ? resolveMnemonic(word.id) : null;
  const reviewVariant = resolved ? toVariant(resolved) : null;
  const variants: MnemonicVariant[] = word
    ? [
        ...[...word.mnemonics]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((mnemonic): MnemonicVariant => ({ source: "builtin", mnemonic })),
        ...Object.values(activeUserMnemonics)
          .filter((mnemonic) => mnemonic.wordId === word.id)
          .sort(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          )
          .map((mnemonic): MnemonicVariant => ({ source: "user", mnemonic })),
      ]
    : [];

  const [phase, setPhase] = useState<"deck" | "check" | "question" | "answer" | "rated">(
    item.kind === "new" ? "deck" : "question",
  );
  const [deckIndex, setDeckIndex] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [updatedCard, setUpdatedCard] = useState<CardRow | null>(null);

  const deckVariant = variants[deckIndex] ?? variants[0];
  const translation = word?.meanings[0] ?? "";

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (item.kind === "new" && phase === "deck") {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setDeckIndex((prev) => Math.min(variants.length - 1, prev + 1));
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          setDeckIndex((prev) => Math.max(0, prev - 1));
        } else if (event.key === "Enter" && deckVariant) {
          event.preventDefault();
          selectMnemonic(item.wordId, deckVariant.mnemonic.id, "initial");
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
  }, [item, phase, deckVariant, variants.length, selectMnemonic, settings.hintsEnabled, rateCard, usedHint]);

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

          {phase === "check" && deckVariant ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary-soft p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Check className="size-4" aria-hidden="true" /> Проверь себя
                </p>
                <p className="mt-1 text-sm text-ink">
                  Свяжите ключ «{deckVariant.mnemonic.cueWord}» с переводом «{translation}».
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MnemonicOption
                  variant={deckVariant}
                  index={deckIndex}
                  total={variants.length}
                  active
                  onSelect={() => undefined}
                />
                <div className="rounded-xl border border-line p-4 text-sm leading-relaxed text-muted">
                  {deckVariant.mnemonic.sceneText}
                </div>
              </div>
              <Button onClick={() => onNext("new")}>Понятно, дальше</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">Выберите ассоциацию, которая понятнее лично вам.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {variants.map((variant, variantIndex) => (
                  <MnemonicOption
                    key={`${variant.source}-${variant.mnemonic.id}`}
                    variant={variant}
                    index={variantIndex}
                    total={variants.length}
                    active={variantIndex === deckIndex}
                    onSelect={() => setDeckIndex(variantIndex)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={!deckVariant}
                  onClick={() => {
                    if (!deckVariant) return;
                    selectMnemonic(item.wordId, deckVariant.mnemonic.id, "initial");
                    setPhase("check");
                  }}
                >
                  Выбрать «{deckVariant?.mnemonic.cueWord ?? "ассоциацию"}»
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
            {hintShown && reviewVariant ? (
              <div className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="coral">Ключ: {reviewVariant.mnemonic.cueWord}</Badge>
                  {reviewVariant.source === "user" ? <Badge variant="primary">Мой</Badge> : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">{reviewVariant.mnemonic.sceneText}</p>
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
            {reviewVariant ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <MnemonicOption
                  variant={reviewVariant}
                  index={0}
                  total={1}
                  active
                  onSelect={() => undefined}
                />
                <div className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="coral">Ключ: {reviewVariant.mnemonic.cueWord}</Badge>
                    {reviewVariant.source === "user" ? <Badge variant="primary">Мой</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{reviewVariant.mnemonic.sceneText}</p>
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
