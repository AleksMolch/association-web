"use client";

/**
 * page.tsx — запрос сброса пароля.
 *
 * Ответ всегда одинаковый, чтобы не раскрывать наличие аккаунта.
 */

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError(result.error.message ?? "Не удалось отправить письмо.");
        return;
      }
      setSent(true);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <Card className="text-center">
        <MailCheck className="mx-auto size-12 text-primary" aria-hidden="true" />
        <CardHeader className="mt-3">
          <CardTitle>Письмо отправлено</CardTitle>
          <CardDescription>
            Если адрес {email} зарегистрирован, на него придёт ссылка для сброса
            пароля. Ссылка действует один час.
          </CardDescription>
        </CardHeader>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">Вернуться ко входу</Link>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Сброс пароля</CardTitle>
        <CardDescription>Укажите email, на который зарегистрирован аккаунт.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Отправляем…" : "Отправить ссылку"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/login" className="font-semibold text-primary hover:underline">Вернуться ко входу</Link>
      </p>
    </Card>
  );
}
