/**
 * button.tsx — кнопки Association Web.
 *
 * Варианты повторяют палитру: основная бирюза, вторичная поверхность,
 * коралловый акцент для разрушительных действий. Размеры не меньше 44 px.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-contrast hover:bg-primary-hover",
        secondary: "border border-line bg-surface text-ink hover:bg-paper-warm",
        ghost: "text-ink hover:bg-primary-soft",
        coral: "bg-coral text-coral-contrast hover:opacity-90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-5",
        lg: "h-12 px-7 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

/** Кнопка с вариантами; для ссылок используйте buttonVariants + next/link. */
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
