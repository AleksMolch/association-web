/**
 * page.tsx — страница «Наука».
 *
 * Честно описывает исследовательскую основу метода ключевых слов и границы
 * применимости FSRS, без обещаний доказанной эффективности каждой картинки.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Наука",
  description:
    "Метод ключевых слов, FSRS и ограничения: что действительно известно об ассоциативном запоминании и интервальном повторении.",
  alternates: { canonical: "/science" },
};

export default function SciencePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8">
      <div className="max-w-3xl space-y-4">
        <Badge variant="primary">Наука</Badge>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Опора на исследования, без обещаний чудес
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          Мы не утверждаем, что конкретная иллюстрация гарантирует запоминание. Метод опирается
          на известные принципы мнемоники, а интервалы — на инженерный алгоритм FSRS.
        </p>
      </div>

      <div className="mt-9 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Метод ключевых слов</CardTitle>
            <CardDescription>
              Raugh и Atkinson (1974) описали два звена: иностранное слово связывается со знакомым
              ключом по звучанию, а мысленный образ связывает ключ с переводом. В их экспериментах
              проверялись конкретные наборы лексики; результат нельзя автоматически переносить на
              любую новую ассоциацию.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>FSRS</CardTitle>
            <CardDescription>
              Free Spaced Repetition Scheduler оценивает вероятность вспоминания и подбирает
              следующий интервал. Это не «магия памяти», а модель, которая обновляется по вашим
              оценкам Again / Hard / Good / Easy.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ограничения</CardTitle>
            <CardDescription>
              Dunlosky и соавторы (2013) отмечают ограниченную долговременную пользу мнемонических
              приёмов вне подходящих задач. Поэтому Association — не замена практике языка и не
              медицинская рекомендация. Оценивайте свой прогресс по реальному использованию слов.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-paper-warm p-6 text-sm leading-relaxed text-muted">
        <p className="font-semibold text-ink">Как мы выбираем ассоциации</p>
        <p className="mt-2">
          Ключ должен быть реальным русским словом, сцена — показывать значение в одном действии,
          а не повторять подпись. Мы избегаем узкого сленга, транслитераций и известных персонажей.
          Если ассоциация не срабатывает, это нормально: выберите другой вариант.
        </p>
      </div>

      <Link href="/demo" className={buttonVariants({ size: "lg", className: "mt-8" })}>
        Проверить на практике
      </Link>
    </div>
  );
}
