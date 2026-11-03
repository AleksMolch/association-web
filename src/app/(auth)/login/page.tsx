"use client";

/**
 * page.tsx — вход по email и паролю.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

function safeNextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signIn.email({ email, password, rememberMe: true });
      if (result.error) {
        setError(result.error.message ?? "Не удалось войти. Проверьте email и пароль.");
        return;
      }
      router.push(safeNextPath());
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Вход</CardTitle>
        <CardDescription>Продолжите с облачным прогрессом и синхронизацией.</CardDescription>
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Пароль</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">Забыли пароль?</Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Входим…" : "Войти"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">Создать</Link>
      </p>
      <p className="mt-3 border-t border-line pt-3 text-center text-xs text-muted">
        Можно продолжить без аккаунта —{" "}
        <Link href="/dashboard" className="font-medium text-primary hover:underline">гостевой режим</Link>.
      </p>
    </Card>
  );
}
