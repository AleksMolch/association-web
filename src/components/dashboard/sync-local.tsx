"use client";

/**
 * sync-local.tsx — синхронизация гостевого прогресса с облаком.
 *
 * Сначала загружает серверный снимок и сливает его по rev, затем отправляет
 * объединённое состояние. Изображения остаются локальными: в запрос попадает
 * только текст личных ассоциаций.
 */

import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import {
  ACCOUNT_MISMATCH_MESSAGE,
  assessGuestOwner,
  readGuestOwner,
  writeGuestOwner,
} from "@/lib/guest-owner";
import { useGuest } from "@/lib/guest-store";
import {
  buildProgressPayload,
  ProgressSyncError,
  pullProgress,
  pushProgress,
} from "@/lib/sync-client";

type SyncSummary = {
  pushed: {
    cards: number;
    userMnemonics: number;
  };
  pulled: {
    cards: number;
    userMnemonics: number;
  };
};

export function SyncLocal() {
  const { data } = useSession();
  const {
    cards,
    userMnemonics,
    settings,
    ready,
    applyServerProgress,
  } = useGuest();
  const [pending, setPending] = useState(false);
  const [synced, setSynced] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);

  const cardCount = Object.keys(cards).length;
  const mnemonicCount = Object.values(userMnemonics).filter(
    (mnemonic) => mnemonic.deletedAt === null,
  ).length;

  if (!ready || !data?.user || dismissed) return null;

  const hasLocalProgress = cardCount > 0 || mnemonicCount > 0;

  async function sync() {
    setPending(true);
    try {
      const userId = data?.user?.id;
      if (!userId) {
        toast.error("Сессия истекла. Войдите заново.");
        return;
      }

      const ownerDecision = assessGuestOwner(readGuestOwner(), userId, {
        settings,
        userMnemonics,
      });

      if (ownerDecision === "mismatch") {
        toast.error(ACCOUNT_MISMATCH_MESSAGE);
        return;
      }

      const server = await pullProgress();
      const merged = applyServerProgress(userId, server);
      const payload = buildProgressPayload(merged.state);

      await pushProgress(merged.state);

      if (ownerDecision === "claim") writeGuestOwner(userId);

      setSummary({
        pushed: {
          cards: payload.cards.length,
          userMnemonics: payload.userMnemonics.length,
        },
        pulled: {
          cards: merged.pulled.cards,
          userMnemonics: merged.pulled.userMnemonics,
        },
      });
      setSynced(true);
      toast.success("Прогресс синхронизирован");
    } catch (error) {
      if (error instanceof ProgressSyncError && error.status === 401) {
        toast.error("Сессия истекла. Войдите заново.");
        return;
      }
      toast.error("Не удалось синхронизировать прогресс. Попробуйте позже.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary-soft/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CloudUpload className="size-5 text-primary" aria-hidden="true" />
          {hasLocalProgress ? "Перенести прогресс в облако" : "Загрузить прогресс из облака"}
        </CardTitle>
        <CardDescription>
          {hasLocalProgress
            ? `На этом устройстве: ${cardCount} карточек и ${mnemonicCount} личных ассоциаций. Текст сохранится в аккаунте, изображения останутся только на своих устройствах.`
            : "Загрузите карточки и личные ассоциации из аккаунта. Изображения остаются только на устройствах, где их добавили."}
        </CardDescription>
      </CardHeader>
      <div className="space-y-3">
        {summary ? (
          <p role="status" className="text-sm text-muted">
            Отправлено: {summary.pushed.cards} карточек,{" "}
            {summary.pushed.userMnemonics} личных ассоциаций. Получено:{" "}
            {summary.pulled.cards} карточек,{" "}
            {summary.pulled.userMnemonics} личных ассоциаций.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={sync} disabled={pending || synced}>
            {pending
              ? "Синхронизируем…"
              : synced
                ? "Синхронизировано"
                : "Синхронизировать прогресс"}
          </Button>
          {synced ? null : (
            <Button variant="ghost" onClick={() => setDismissed(true)}>Позже</Button>
          )}
        </div>
      </div>
    </Card>
  );
}
