/**
 * page.tsx — страница «Метод».
 *
 * Объясняет три звена мнемонической связки на реальных карточках Association.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWord, imageUrl } from "@/content";

export const metadata: Metadata = {
  title: "Метод",
  description:
    "Как работает метод Association: русское созвучие, книжная сцена и интервальное повторение. Три звена без обещаний «выучить язык за неделю».",
  alternates: { canonical: "/method" },
};

export default function MethodPage() {
  const bright = getWord(1);
  const dirty = getWord(3);
  const examples = [
    bright
      ? {
          word: bright,
          mnemonic: bright.mnemonics.find((m) => m.cueWord === "Брат") ?? bright.mnemonics[0],
          note: "Созвучие bright — «брат». Брат светится, как лампа: значение «яркий» считывается из действия.",
        }
      : null,
    dirty
      ? {
          word: dirty,
          mnemonic: dirty.mnemonics.find((m) => m.cueWord === "Дети") ?? dirty.mnemonics[0],
          note: "Созвучие dirty — «дети». Дети вылезают из грязной лужи: «грязный» показан буквально.",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8">
      <div className="max-w-3xl space-y-4">
        <Badge variant="primary">Метод</Badge>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Слово, созвучие и один ясный кадр
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          Association использует метод ключевых слов: английское слово цепляется за знакомое
          русское созвучие, а сцена связывает это созвучие с переводом. Дальше слово возвращается
          по алгоритму FSRS.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          ["1. Созвучие", "Ключ — реальное русское слово или короткое выражение, близкое по звучанию."],
          ["2. Сцена", "Ключ и значение встречаются в одном действии. Без подписей и сложных символов."],
          ["3. Повторение", "FSRS выбирает интервал по вашей оценке: Again, Hard, Good или Easy."],
        ].map(([title, text]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 font-serif text-3xl font-semibold text-ink">Примеры</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {examples.map(({ word, mnemonic, note }) => (
          <Card key={word.id} className="overflow-hidden p-0">
            <div className="relative aspect-[4/3] bg-paper-warm">
              <Image
                src={imageUrl(mnemonic.image)}
                alt={`Ассоциация к слову ${word.lemma}: ${mnemonic.sceneText}`}
                fill
                sizes="(max-width: 768px) 100vw, 440px"
                className="object-cover"
              />
            </div>
            <div className="space-y-2 p-5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-serif text-2xl font-semibold text-ink">{word.lemma}</span>
                <span className="text-sm text-muted">{word.ipa} · {word.meanings[0]}</span>
              </div>
              <Badge variant="coral">Ключ: {mnemonic.cueWord}</Badge>
              <p className="text-sm leading-relaxed text-ink">{mnemonic.sceneText}</p>
              <p className="text-sm leading-relaxed text-muted">{note}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-line bg-paper-warm p-6">
        <h2 className="font-serif text-2xl font-semibold text-ink">Чего метод не делает</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <li>Не заменяет практику речи, чтения и грамматики.</li>
          <li>Не гарантирует запоминание: ассоциация субъективна и может не сработать лично для вас.</li>
          <li>Не оценивает ваш уровень языка и не обещает «свободный английский».</li>
          <li>Не скрывает ограничения: если связка не помогает, выберите другую или добавьте свою.</li>
        </ul>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/demo" className={buttonVariants({ size: "lg" })}>
          Попробовать демо <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href="/science" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Что говорит наука
        </Link>
      </div>
    </div>
  );
}
