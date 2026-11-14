"use client";

/**
 * use-vip-status.ts — активна ли VIP-подписка текущего пользователя.
 *
 * Пока статус неизвестен, реклама не загружается, чтобы VIP не увидел её
 * до ответа сервера.
 */

import { useEffect, useState } from "react";

import { useSession } from "@/lib/auth-client";

export function useVipStatus(): { vipActive: boolean; vipLoading: boolean } {
  const { data } = useSession();
  const [active, setActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Синхронный сброс состояния в начале эффекта — намеренная синхронизация
    // с внешней системой (сессией), а не каскадные обновления.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!data?.user) {
      setActive(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/billing/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (cancelled) return;
        const subscription = json?.subscription;
        const valid = Boolean(
          subscription && new Date(subscription.endsAt).getTime() > Date.now(),
        );
        setActive(valid);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setActive(false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.user]);

  return { vipActive: active === true, vipLoading: loading };
}
