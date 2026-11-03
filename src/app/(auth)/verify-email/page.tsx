"use client";

/**
 * page.tsx — инструкция по подтверждению email и повторная отправка письма.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

function VerifyContent() {
  const params = useSearchParams();
  const initialEmail = params.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);

  return (
    <Card className="text-center">
      <MailCheck className="mx-auto size-12 text-primary" aria-hidden="true" />
      <CardHeader className="mt-3">
        <CardTitle>Подтвердите email</CardTitle>
        <CardDescription>
          Перейдите по ссылке из письма. После подтверждения можно войти и
          сохранить прогресс в облаке.
        </CardDescription>
      </CardHeader>
      <div className="space-y-3 text-left">
        <label htmlFor="email" className="block text-sm font-semibold text-ink">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
        <Button
          className="w-full"
          disabled={pending || !email}
          onClick={async () => {
            setPending(true);
            try {
              const result = await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard" });
              if (result.error) {
                toast.error(result.error.message ?? "Не удалось отправить письмо");
              } else {
                toast.success("Письмо отправлено, если аккаунт существует");
              }
            } catch {
              toast.error("Не удалось связаться с сервером");
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Отправляем…" : "Отправить письмо ещё раз"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Войти</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>Продолжить как гость</Link>
      </div>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Card><p className="text-sm text-muted">Загружаем…</p></Card>}>
      <VerifyContent />
    </Suspense>
  );
}
