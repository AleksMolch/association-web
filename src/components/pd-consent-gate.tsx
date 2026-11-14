"use client";

/**
 * pd-consent-gate.tsx — повторное согласие для старых аккаунтов.
 *
 * Если у пользователя нет pdConsentAt, вход в личные разделы блокируется до
 * подтверждения согласия. Новые аккаунты фиксируют согласие при регистрации.
 */

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { PD_CONSENT_VERSION } from "@/lib/pd-consent";

type SessionUser = {
  id: string;
  pdConsentAt?: string | null;
};

export function PdConsentGate() {
  const { data, refetch } = useSession();
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionUser = data?.user as SessionUser | undefined;
  const locallyAccepted =
    Boolean(sessionUser) &&
    typeof window !== "undefined" &&
    window.localStorage.getItem(`mnemoslov_pd_consent_${sessionUser?.id}`) === "1";
  if (!sessionUser || sessionUser.pdConsentAt || locallyAccepted || accepted) return null;

  async function accept() {
    if (!checked || !sessionUser) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/privacy/pd-consent", { method: "POST" });
      if (!response.ok) {
        setError("Не удалось сохранить согласие. Попробуйте ещё раз.");
        return;
      }
      window.localStorage.setItem(`mnemoslov_pd_consent_${sessionUser.id}`, "1");
      setAccepted(true);
      await refetch();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <Card className="w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="pd-consent-title">
        <CardHeader>
          <ShieldCheck className="size-8 text-primary" aria-hidden="true" />
          <CardTitle id="pd-consent-title">Согласие на обработку данных</CardTitle>
          <CardDescription>
            До продолжения подтвердите согласие на обработку персональных данных.
            Это требуется для аккаунтов, созданных до обновления политики.
          </CardDescription>
        </CardHeader>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-paper-warm p-3 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span>
            Я принимаю{" "}
            <Link href="/terms" target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
              Пользовательское соглашение
            </Link>{" "}
            и даю согласие на обработку персональных данных на условиях{" "}
            <Link href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
              Политики
            </Link>
            . Версия {PD_CONSENT_VERSION}.
          </span>
        </label>
        {error ? <p role="alert" className="mt-3 text-xs font-medium text-coral">{error}</p> : null}
        <Button className="mt-4 w-full" onClick={accept} disabled={!checked || pending}>
          {pending ? "Сохраняем…" : "Подтвердить и продолжить"}
        </Button>
      </Card>
    </div>
  );
}
