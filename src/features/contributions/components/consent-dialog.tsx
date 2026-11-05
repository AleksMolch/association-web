"use client";

/**
 * consent-dialog.tsx — диалог добровольного участия.
 *
 * Показывает точные тексты §9.2 и не блокирует сохранение: решение можно
 * принять, отложить или раскрыть подробности и отказаться навсегда.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CONSENT_COPY,
  type ConsentAction,
} from "@/features/contributions/consent";

export type ConsentDialogProps = {
  open: boolean;
  onAction: (action: ConsentAction) => void;
};

export function ConsentDialog({ open, onAction }: ConsentDialogProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;

    headingRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onAction("ask_later");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onAction]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-dialog-title"
        aria-describedby="consent-dialog-body"
        className="w-full max-w-lg"
      >
        <Card className="max-h-[90vh] space-y-4 overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="consent-dialog-title"
              ref={headingRef}
              tabIndex={-1}
              className="font-serif text-xl font-semibold text-ink outline-none"
            >
              {CONSENT_COPY.title}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Отложить вопрос"
              onClick={() => onAction("ask_later")}
            >
              <span aria-hidden="true" className="text-xl">×</span>
            </Button>
          </div>

          <p
            id="consent-dialog-body"
            className="text-sm leading-relaxed text-ink"
          >
            {CONSENT_COPY.body}
          </p>

          {detailsOpen ? (
            <div className="space-y-2 rounded-xl border border-line bg-paper-warm p-3">
              <p className="text-sm font-semibold text-ink">
                {CONSENT_COPY.detailTitle}
              </p>
              <p className="text-xs leading-relaxed text-muted">
                {CONSENT_COPY.detailBody}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAction("decline")}
              >
                {CONSENT_COPY.detailDeclineButton}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              onClick={() => setDetailsOpen(true)}
            >
              {CONSENT_COPY.detailLink}
            </Button>
          )}

          <div className="flex flex-col gap-2">
            <Button type="button" onClick={() => onAction("grant")}>
              {CONSENT_COPY.grantButton}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onAction("ask_later")}
            >
              {CONSENT_COPY.declineButton}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
