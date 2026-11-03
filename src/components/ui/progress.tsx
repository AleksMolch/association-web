/**
 * progress.tsx — индикатор прогресса без клиентского JS.
 */

import { cn } from "@/lib/utils";

export function Progress({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label ?? "Прогресс"}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-primary-soft", className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
