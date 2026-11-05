"use client";

/**
 * decision-controls.tsx — кнопки решений модератора.
 *
 * Approve только помечает вклад одобренным для редактуры: контент не
 * публикуется автоматически. Reject и needs_edit требуют причину.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { ModerationAction } from "@/lib/server/moderation";

const ACTIONS: { action: ModerationAction; label: string }[] = [
  { action: "approve", label: "Одобрить" },
  { action: "needs_edit", label: "На доработку" },
  { action: "reject", label: "Отклонить" },
  { action: "duplicate", label: "Дубликат" },
  { action: "withdraw", label: "Отозвать" },
];

const REASON_PROMPTS: Partial<Record<ModerationAction, string>> = {
  reject: "Причина отклонения",
  needs_edit: "Что нужно исправить",
  duplicate: "Причина (необязательно)",
};

export function DecisionControls({
  contributionId,
  status,
}: {
  contributionId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: ModerationAction) {
    let reason: string | undefined;
    const promptText = REASON_PROMPTS[action];
    if (promptText) {
      const value = window.prompt(promptText);
      if (value === null) return;
      reason = value.trim();
      if (
        !reason &&
        (action === "reject" || action === "needs_edit")
      ) {
        setError("Для этого решения нужна причина.");
        return;
      }
      if (!reason) reason = undefined;
    }

    setBusy(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/mnemonic-contributions/${encodeURIComponent(contributionId)}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? "Не удалось сохранить решение.");
        return;
      }
      router.refresh();
    } catch {
      setError("Не удалось сохранить решение.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-w-48 flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {ACTIONS.map(({ action, label }) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={action === "reject" ? "coral" : action === "approve" ? "primary" : "secondary"}
            disabled={busy !== null || (action === "withdraw" && status === "withdrawn")}
            onClick={() => void decide(action)}
          >
            {busy === action ? "…" : label}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-coral">{error}</p> : null}
    </div>
  );
}
