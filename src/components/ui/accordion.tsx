/**
 * accordion.tsx — FAQ на нативном details/summary.
 *
 * Работает без JavaScript и сохраняет доступность клавиатуры; внешний вид
 * соответствует карточкам Association.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export function Accordion({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("divide-y divide-line rounded-2xl border border-line bg-surface", className)} {...props} />;
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group px-5 py-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink">
        {title}
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pt-2 text-sm leading-relaxed text-muted">{children}</div>
    </details>
  );
}
