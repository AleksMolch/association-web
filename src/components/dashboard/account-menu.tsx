"use client";

/**
 * account-menu.tsx — состояние входа в шапке кабинета.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";

export function AccountMenu() {
  const router = useRouter();
  const { data, isPending } = useSession();

  if (isPending) {
    return <span className="text-xs text-muted">Проверяем вход…</span>;
  }

  if (!data?.user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Войти</Link>
        <Link href="/register" className={buttonVariants({ size: "sm" })}>Регистрация</Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden max-w-32 truncate text-xs text-muted sm:inline">{data.user.email}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await signOut();
          router.push("/");
          router.refresh();
        }}
      >
        Выйти
      </Button>
    </div>
  );
}
