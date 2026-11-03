/**
 * badge.tsx — небольшие метки статусов и категорий.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "border-line bg-paper-warm text-ink",
        primary: "border-transparent bg-primary-soft text-primary",
        coral: "border-transparent bg-coral-soft text-coral",
        success: "border-transparent bg-primary-soft text-success",
        outline: "border-line bg-transparent text-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
