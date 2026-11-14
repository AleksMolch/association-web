"use client";

/**
 * page.tsx — регистрация по email и паролю.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { humanizeAuthError } from "@/lib/auth-errors";
import { PD_CONSENT_LABEL, PD_CONSENT_VERSION } from "@/lib/pd-consent";

function safeNextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pdConsent, setPdConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2) {
      setError("Введите имя (минимум 2 символа).");
      return;
    }
    if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail)) {
      setError("Введите корректный email, например you@example.com.");
      return;
    }
    if (!pdConsent) {
      setError("Для регистрации нужно согласие на обработку персональных данных.");
      return;
    }
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
      const result = await authClient.signUp.email({
        name: cleanName,
        email: cleanEmail,
        password,
        callbackURL: safeNextPath(),
        pdConsentAt: new Date().toISOString(),
        pdConsentVersion: PD_CONSENT_VERSION,
      } as Parameters<typeof authClient.signUp.email>[0]);
      if (result.error) {
        setError(humanizeAuthError(result.error.message, "Не удалось создать аккаунт. Попробуйте ещё раз."));
        return;
      }
      if (!result.data?.token) {
        setVerifyEmail(true);
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

  if (verifyEmail) {
    return (
      <Card className="text-center">
        <MailCheck className="mx-auto size-12 text-primary" aria-hidden="true" />
        <CardHeader className="mt-3">
          <CardTitle>Проверьте почту</CardTitle>
          <CardDescription>
            Мы отправили письмо на {email}. Перейдите по ссылке, чтобы подтвердить
            адрес и завершить регистрацию.
          </CardDescription>
        </CardHeader>
        <Link href={`/verify-email?email=${encodeURIComponent(email)}`} className="text-sm font-semibold text-primary hover:underline">
          Открыть инструкцию
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Создать аккаунт</CardTitle>
        <CardDescription>Сохраните прогресс в облаке и синхронизируйте устройства.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Имя</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Как к вам обращаться"
            aria-invalid={Boolean(error)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(error)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Пароль</Label>
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
          <p className="text-xs text-muted">Минимум 8 символов.</p>
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
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-paper-warm p-3 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={pdConsent}
            onChange={(event) => setPdConsent(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
            required
          />
          <span>
            {PD_CONSENT_LABEL}{" "}
            <Link href="/terms" className="font-medium text-primary underline underline-offset-2">
              Соглашение
            </Link>
            {" · "}
            <Link href="/privacy" className="font-medium text-primary underline underline-offset-2">
              Политика ПДн
            </Link>
          </span>
        </label>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Создаём…" : "Создать аккаунт"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">Войти</Link>
      </p>
    </Card>
  );
}
