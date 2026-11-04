import { hasVip } from "@/lib/billing/service";

export async function requireVip(userId: string): Promise<boolean> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return false;
  return hasVip(normalizedUserId);
}
