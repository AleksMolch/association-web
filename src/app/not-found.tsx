import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 items-center px-5 py-16">
      <Card className="w-full text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">404</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">Страница не найдена</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Возможно, ссылка устарела. Вернитесь на главную или откройте тренажёр.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/" className={buttonVariants()}>На главную</Link>
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>В кабинет</Link>
        </div>
      </Card>
    </main>
  );
}
