/**
 * guest-owner.ts — маркер аккаунта, которому принадлежат локальные данные.
 *
 * Данные гостя общие для браузера, поэтому перед синхронизацией или отправкой
 * согласия нужно убедиться, что они не принадлежат другому аккаунту. Маркер
 * хранится отдельно от прогресса и не удаляется автоматически.
 */

import type { Settings } from "@/lib/types";
import type { UserMnemonic } from "@/features/user-mnemonics/types";

export const GUEST_OWNER_KEY = "association_guest_owner";

export const ACCOUNT_MISMATCH_MESSAGE =
  "Локальные данные принадлежат другому аккаунту. Очистите локальные данные или используйте отдельный профиль.";

export type LocalOwnerSnapshot = {
  settings: Pick<Settings, "contributionConsent" | "contributionConsentVersion">;
  userMnemonics: Record<string, UserMnemonic>;
};

export type LocalOwnerDecision = "claim" | "ok" | "mismatch";

/** true, когда на устройстве есть личный текст или решение о согласии. */
export function hasLocalPersonalData(snapshot: LocalOwnerSnapshot): boolean {
  if (Object.keys(snapshot.userMnemonics).length > 0) return true;

  return (
    snapshot.settings.contributionConsent !== "unset" ||
    snapshot.settings.contributionConsentVersion !== null
  );
}

/**
 * Решает, можно ли работать с текущим аккаунтом.
 *
 * Если маркера ещё нет, его нужно записать. Чужой маркер блокирует действие
 * только при наличии локального личного текста или согласия.
 */
export function assessGuestOwner(
  storedOwner: string | null,
  userId: string,
  snapshot: LocalOwnerSnapshot,
): LocalOwnerDecision {
  if (!storedOwner) return "claim";
  if (storedOwner === userId) return "ok";
  return hasLocalPersonalData(snapshot) ? "mismatch" : "claim";
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Читает сохранённый маркер аккаунта. */
export function readGuestOwner(): string | null {
  const store = storage();
  if (!store) return null;

  try {
    const value = store.getItem(GUEST_OWNER_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Запоминает текущий аккаунт как владельца локальных данных. */
export function writeGuestOwner(userId: string): void {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(GUEST_OWNER_KEY, userId);
  } catch {
    // Переполнение localStorage не должно ломать синхронизацию.
  }
}

/** Удаляет маркер владельца вместе с локальными данными. */
export function clearGuestOwner(): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(GUEST_OWNER_KEY);
  } catch {
    // ignore
  }
}
