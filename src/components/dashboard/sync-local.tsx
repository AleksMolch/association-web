"use client";

/**
 * sync-local.tsx — перенос гостевого прогресса в облако после входа.
 *
 * Явное действие пользователя: локальные карточки отправляются на сервер,
 * где конфликты решаются по rev. Повторный вызов безопасен.
 */

import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { useGuest } from "@/lib/guest-store";

export function SyncLocal() {
  const { data } = useSession();
  const { cards, preferred, settings, reviews, ready } = useGuest();
  const [pending, setPending] = useState(false);
  const [synced, setSynced] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const count = Object.keys(cards).length;
  if (!ready || !data?.user || count === 0 || synced || dismissed) return null;

  async function sync() {
    setPending(true);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: Object.values(cards),
          selections: Object.fromEntries(preferred),
          settings,
          reviews,
        }),
      });
      if (response.status === 401) {
        toast.error("Сессия истекла. Войдите заново.");
        return;
      }
      if (!response.ok) {
        toast.error("Не удалось перенести прогресс. Попробуйте позже.");
        return;
      }
      setSynced(true);
      toast.success("Локальный прогресс перенесён в облако");
    } catch {
      toast.error("Не удалось связаться с сервером");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary-soft/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CloudUpload className="size-5 text-primary" aria-hidden="true" />
          Перенести прогресс в облако
        </CardTitle>
        <CardDescription>
          На этом устройстве есть {count} карточек. Сохраните их в аккаунте,
          чтобы продолжить на другом устройстве.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-wrap gap-2">
        <Button onClick={sync} disabled={pending}>
          {pending ? "Переносим…" : "Перенести прогресс"}
        </Button>
        <Button variant="ghost" onClick={() => setDismissed(true)}>Позже</Button>
      </div>
    </Card>
  );
}
