/**
 * contribution-rate-limit.ts — простой in-memory счётчик batch-запросов.
 *
 * Ограничение действует в пределах одного процесса и сбрасывается при
 * рестарте/деплое. Несколько инстансов не разделяют счётчики; для строгого
 * продакшен-лимита нужен Redis или БД-счётчик.
 */

export const CONTRIBUTION_BATCH_LIMIT = 30;
export const CONTRIBUTION_BATCH_WINDOW_MS = 60 * 60 * 1000;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

/** Списывает одну попытку batch-запроса; false — лимит исчерпан. */
export function consumeContributionBatchAllowance(
  userId: string,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(userId);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + CONTRIBUTION_BATCH_WINDOW_MS });
    return true;
  }

  if (bucket.count >= CONTRIBUTION_BATCH_LIMIT) return false;

  bucket.count += 1;
  return true;
}

/** Сбрасывает счётчики между тестами. */
export function resetContributionRateLimitForTests(): void {
  buckets.clear();
}
