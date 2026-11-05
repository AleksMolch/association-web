/**
 * outbox.ts — очередь текстовых вкладов веб-версии.
 *
 * Очередь хранится в localStorage отдельно для каждого пользователя. Вклад
 * попадает в неё только при согласии `granted` и активной сессии. В снимке
 * нет изображений: только текст, идентификаторы и версия согласия. Отправка
 * выполняется батчами до 50 записей без фонового воркера.
 */

import type {
  MnemonicContributionInput,
  UserMnemonic,
} from "@/features/user-mnemonics/types";

import { CONSENT_VERSION } from "./consent";
import type { ContributionConsent } from "@/features/user-mnemonics/types";

const BATCH_SIZE = 50;
const WITHDRAW_BATCH_SIZE = 200;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;
const STORAGE_PREFIX = "association_contribution_outbox_v1";

/** Минимальный интерфейс localStorage, удобный для фейков в тестах. */
export type OutboxStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

type OutboxEntry = {
  id: string;
  sourceMnemonicId: string;
  payload: MnemonicContributionInput;
  status: "pending" | "blocked" | "rejected";
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
};

/** Зависимости очереди; в приложении используются значения по умолчанию. */
export type OutboxOptions = {
  userId?: string | null;
  authenticated?: boolean;
  consentStatus?: ContributionConsent;
  consentVersion?: string | null;
  storage?: OutboxStorage | null;
  fetch?: typeof fetch;
  randomUUID?: () => string;
  now?: () => Date;
};

/** Ошибка отправки вкладов с HTTP-статусом, если он известен. */
export class ContributionOutboxError extends Error {
  readonly status: number | null;
  readonly code: "not_authenticated" | "network" | "server";

  constructor(
    code: ContributionOutboxError["code"],
    status: number | null = null,
    message = "Не удалось отправить вклады.",
  ) {
    super(message);
    this.name = "ContributionOutboxError";
    this.code = code;
    this.status = status;
  }
}

const memoryValues = new Map<string, string>();

const memoryStorage: OutboxStorage = {
  getItem: (key) => memoryValues.get(key) ?? null,
  setItem: (key, value) => {
    memoryValues.set(key, value);
  },
  removeItem: (key) => {
    memoryValues.delete(key);
  },
};

/** Ключ localStorage для очереди конкретного пользователя. */
export function outboxStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}`;
}

function resolveStorage(options: OutboxOptions): OutboxStorage {
  if (options.storage !== undefined) {
    return options.storage ?? memoryStorage;
  }

  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  return memoryStorage;
}

function resolveNow(options: OutboxOptions): Date {
  return (options.now ?? (() => new Date()))();
}

function resolveRandomUUID(options: OutboxOptions): string {
  return (options.randomUUID ?? (() => crypto.randomUUID()))();
}

function sameRevision(
  payload: MnemonicContributionInput,
  mnemonic: UserMnemonic,
): boolean {
  return (
    payload.sourceMnemonicId === mnemonic.id &&
    payload.wordId === mnemonic.wordId &&
    payload.meaningId === mnemonic.meaningId &&
    payload.cueWord === mnemonic.cueWord &&
    payload.sceneText === mnemonic.sceneText &&
    payload.locale === mnemonic.locale &&
    payload.submittedAt === mnemonic.updatedAt
  );
}

function readQueue(userId: string, storage: OutboxStorage): OutboxEntry[] {
  try {
    const raw = storage.getItem(outboxStorageKey(userId));

    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(
  userId: string,
  storage: OutboxStorage,
  entries: OutboxEntry[],
): void {
  try {
    if (entries.length === 0) {
      storage.removeItem(outboxStorageKey(userId));
      return;
    }

    storage.setItem(outboxStorageKey(userId), JSON.stringify(entries));
  } catch {
    // Переполнение localStorage не должно ломать сохранение ассоциации.
  }
}

/**
 * Добавляет текстовый вклад в очередь текущего пользователя.
 *
 * Без `granted`, авторизации или идентификатора пользователя функция ничего
 * не делает. Повторный вызов для той же ревизии идемпотентен; новая ревизия
 * заменяет ещё не отправленный снимок.
 */
export function enqueueContribution(
  mnemonic: UserMnemonic,
  options: OutboxOptions = {},
): void {
  const userId = options.userId ?? null;

  if (
    !userId ||
    !options.authenticated ||
    options.consentStatus !== "granted" ||
    !mnemonic.id ||
    mnemonic.deletedAt !== null
  ) {
    return;
  }

  const storage = resolveStorage(options);
  const now = resolveNow(options);
  const entries = readQueue(userId, storage);
  const existingIndex = entries.findIndex(
    (entry) =>
      entry.sourceMnemonicId === mnemonic.id &&
      (entry.status === "pending" ||
        entry.status === "blocked" ||
        entry.status === "rejected"),
  );
  const existing = existingIndex >= 0 ? entries[existingIndex] : null;

  if (existing && sameRevision(existing.payload, mnemonic)) return;

  const entry: OutboxEntry = {
    id: resolveRandomUUID(options),
    sourceMnemonicId: mnemonic.id,
    payload: {
      clientContributionId: resolveRandomUUID(options),
      sourceMnemonicId: mnemonic.id,
      wordId: mnemonic.wordId,
      meaningId: mnemonic.meaningId,
      cueWord: mnemonic.cueWord,
      sceneText: mnemonic.sceneText,
      locale: mnemonic.locale,
      consentVersion: options.consentVersion ?? CONSENT_VERSION,
      submittedAt: mnemonic.updatedAt,
    },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: null,
    createdAt: now.toISOString(),
  };

  if (existingIndex >= 0) entries[existingIndex] = entry;
  else entries.push(entry);

  writeQueue(userId, storage, entries);
}

function nextAttemptAt(now: Date, attemptCount: number): string {
  const delay = Math.min(
    BACKOFF_BASE_MS * 2 ** Math.max(0, attemptCount - 1),
    BACKOFF_MAX_MS,
  );

  return new Date(now.getTime() + delay).toISOString();
}

function markAttemptFailure(
  entries: OutboxEntry[],
  failedIds: Set<string>,
  now: Date,
): void {
  for (const entry of entries) {
    if (!failedIds.has(entry.id)) continue;

    const attemptCount = entry.attemptCount + 1;
    entry.attemptCount = attemptCount;
    entry.nextAttemptAt = nextAttemptAt(now, attemptCount);
    entry.status = "pending";
  }
}

function collectIds(value: unknown, key: "accepted" | "duplicates"): string[] {
  if (!value || typeof value !== "object") return [];

  const bucket = (value as Record<string, unknown>)[key];

  if (!bucket || typeof bucket !== "object") return [];

  const ids = (bucket as { ids?: unknown }).ids;

  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

function collectRejected(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const bucket = (value as { rejected?: unknown }).rejected;

  if (!bucket || typeof bucket !== "object") return [];

  const items = (bucket as { items?: unknown }).items;

  if (!Array.isArray(items)) return [];

  return items
    .map((item) =>
      item && typeof item === "object"
        ? (item as { clientContributionId?: unknown }).clientContributionId
        : null,
    )
    .filter((id): id is string => typeof id === "string");
}

/**
 * Отправляет готовые вклады батчами до 50 записей.
 *
 * При 403 очередь останавливается, а ожидающие записи помечаются `blocked`.
 * Сетевой сбой или 5xx увеличивает `attemptCount` и откладывает повтор с
 * экспоненциальной задержкой. Принятые и дубликаты удаляются из очереди.
 */
export async function flushOutbox(
  options: OutboxOptions = {},
): Promise<{ sent: number; failed: number }> {
  const userId = options.userId ?? null;

  if (!userId) return { sent: 0, failed: 0 };

  const storage = resolveStorage(options);
  const now = resolveNow(options);
  const nowIso = now.toISOString();
  let entries = readQueue(userId, storage);
  const due = entries.filter(
    (entry) =>
      entry.status === "pending" &&
      (entry.nextAttemptAt === null || entry.nextAttemptAt <= nowIso),
  );

  if (due.length === 0) return { sent: 0, failed: 0 };

  const doFetch = options.fetch ?? fetch;
  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < due.length; offset += BATCH_SIZE) {
    const chunk = due.slice(offset, offset + BATCH_SIZE);
    const chunkIds = new Set(chunk.map((entry) => entry.id));
    let response: Response;

    try {
      response = await doFetch("/api/mnemonic-contributions/batch", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          items: chunk.map((entry) => entry.payload),
        }),
      });
    } catch {
      markAttemptFailure(entries, chunkIds, now);
      failed += chunk.length;
      writeQueue(userId, storage, entries);
      break;
    }

    if (response.status === 403) {
      for (const entry of entries) {
        if (entry.status === "pending") entry.status = "blocked";
      }
      writeQueue(userId, storage, entries);
      break;
    }

    if (response.status === 401) break;

    if (!response.ok) {
      markAttemptFailure(entries, chunkIds, now);
      failed += chunk.length;
      writeQueue(userId, storage, entries);
      break;
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch {
      markAttemptFailure(entries, chunkIds, now);
      failed += chunk.length;
      writeQueue(userId, storage, entries);
      break;
    }

    const acceptedIds = new Set([
      ...collectIds(body, "accepted"),
      ...collectIds(body, "duplicates"),
    ]);
    const rejectedIds = new Set(collectRejected(body));
    const removeIds = new Set<string>();
    const rejectedEntryIds = new Set<string>();
    const unresolvedIds = new Set<string>();

    for (const entry of chunk) {
      const clientId = entry.payload.clientContributionId;

      if (acceptedIds.has(clientId)) {
        removeIds.add(entry.id);
        continue;
      }

      if (rejectedIds.has(clientId)) {
        rejectedEntryIds.add(entry.id);
        continue;
      }

      unresolvedIds.add(entry.id);
    }

    sent += removeIds.size;
    failed += rejectedEntryIds.size + unresolvedIds.size;
    markAttemptFailure(entries, unresolvedIds, now);

    for (const entry of entries) {
      if (rejectedEntryIds.has(entry.id)) entry.status = "rejected";
    }

    entries = entries.filter((entry) => !removeIds.has(entry.id));
    writeQueue(userId, storage, entries);
  }

  return { sent, failed };
}

/**
 * Удаляет неотправленные записи очереди текущего пользователя.
 *
 * Вызывается при отказе от участия и отзыве согласия, чтобы старые тексты не
 * ушли на сервер после повторного включения настройки.
 */
export function clearPendingOutbox(options: OutboxOptions = {}): void {
  const userId = options.userId ?? null;

  if (!userId) return;

  writeQueue(userId, resolveStorage(options), []);
}

/**
 * Отзывает ранее переданные вклады по идентификаторам исходных ассоциаций.
 *
 * Очередь очищается сразу, затем идентификаторы отправляются батчами до 200.
 */
export async function submitWithdrawal(
  sourceMnemonicIds: string[],
  options: OutboxOptions = {},
): Promise<void> {
  const userId = options.userId ?? null;

  if (!userId) {
    throw new ContributionOutboxError("not_authenticated");
  }

  clearPendingOutbox(options);

  const ids = [
    ...new Set(
      sourceMnemonicIds.filter(
        (id) => typeof id === "string" && id.length >= 1 && id.length <= 128,
      ),
    ),
  ];

  if (ids.length === 0) return;

  const doFetch = options.fetch ?? fetch;

  for (let offset = 0; offset < ids.length; offset += WITHDRAW_BATCH_SIZE) {
    const chunk = ids.slice(offset, offset + WITHDRAW_BATCH_SIZE);
    let response: Response;

    try {
      response = await doFetch("/api/mnemonic-contributions/withdraw", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ sourceMnemonicIds: chunk }),
      });
    } catch {
      throw new ContributionOutboxError("network");
    }

    if (!response.ok) {
      throw new ContributionOutboxError(
        response.status === 401 ? "not_authenticated" : "server",
        response.status,
      );
    }
  }
}

/** Синоним `submitWithdrawal` из интерфейса задачи. */
export function withdrawContributions(
  sourceMnemonicIds: string[],
  options: OutboxOptions = {},
): Promise<void> {
  return submitWithdrawal(sourceMnemonicIds, options);
}
