"use client";

/**
 * page.tsx — установка нового пароля по токену из письма.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ссылка недействительна</CardTitle>
          <CardDescription>
            В ссылке нет токена сброса. Запросите новое письмо или проверьте,
            что скопировали ссылку целиком.
          </CardDescription>
        </CardHeader>
        <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:underline">
          Запросить новую ссылку
        </Link>
      </Card>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов.");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: token ?? undefined });
      if (result.error) {
        setError(result.error.message ?? "Ссылка устарела. Запросите новую.");
        return;
      }
      router.push("/login");
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый пароль</CardTitle>
        <CardDescription>Задайте пароль длиной не менее 8 символов.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Новый пароль</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Повторите пароль</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить пароль"}
        </Button>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Card><p className="text-sm text-muted">Проверяем ссылку…</p></Card>}>
      <ResetForm />
    </Suspense>
  );
}
