"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 items-center px-5 py-16">
      <Card className="w-full text-center">
        <h1 className="font-serif text-3xl font-semibold text-ink">Что-то пошло не так</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Попробуйте обновить раздел. Если ошибка повторяется, вернитесь позже.
        </p>
        <Button className="mt-5" onClick={reset}>Попробовать снова</Button>
      </Card>
    </main>
  );
}
