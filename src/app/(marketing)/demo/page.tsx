/**
 * page.tsx — демо-тренировка без регистрации.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { DemoTrainer } from "@/components/demo/demo-trainer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Демо",
  description:
    "Три демонстрационные карточки Association: выберите ассоциацию и посмотрите, как устроен тренажёр. Без регистрации.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-3">
          <Badge variant="primary">Без регистрации</Badge>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Три карточки, чтобы почувствовать метод
          </h1>
          <p className="text-base leading-relaxed text-muted">
            Это не тест памяти и не сохранение прогресса. Просто посмотрите, как
            созвучие и сцена связываются с переводом.
          </p>
        </div>
        <Link href="/pricing" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Тарифы
        </Link>
      </div>
      <DemoTrainer />
    </div>
  );
}
