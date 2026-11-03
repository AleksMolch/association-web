"use client";

/**
 * providers.tsx — клиентские провайдеры приложения.
 *
 * GuestProvider хранит локальный прогресс до регистрации; Toaster показывает
 * короткие уведомления форм и действий.
 */

import { Toaster } from "sonner";

import { GuestProvider } from "@/lib/guest-store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GuestProvider>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </GuestProvider>
  );
}
