// @vitest-environment jsdom

/**
 * outbox.test.ts — localStorage-очередь текстовых вкладов веб-версии.
 *
 * fetch и хранилище подменяются фейками. Проверяются согласие и авторизация,
 * отсутствие медиа в снимке, идемпотентность по ревизии, батчи по 50,
 * остановка на 403, backoff, очистка при отзыве и изоляция по пользователю.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMnemonic } from "@/features/user-mnemonics/types";

import {
  clearOutboxStorage,
  clearPendingOutbox,
  enqueueContribution,
  flushOutbox,
  outboxStorageKey,
  resetBlockedOutbox,
  resumeOutboxAfterGrant,
  submitWithdrawal,
  type OutboxStorage,
} from "./outbox";

type StoredEntry = {
  id: string;
  sourceMnemonicId: string;
  payload: {
    clientContributionId: string;
    cueWord: string;
    submittedAt: string;
  };
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
};

class MemoryStorage implements OutboxStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function mnemonic(overrides: Partial<UserMnemonic> = {}): UserMnemonic {
  return {
    id: "usr-1",
    wordId: 7,
    meaningId: "0",
    cueWord: "Брат",
    sceneText: "Брат похож на брата",
    locale: "ru",
    createdAt: "2026-11-05T10:00:00.000Z",
    updatedAt: "2026-11-05T10:00:00.000Z",
    deletedAt: null,
    rev: 1,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function acceptedFor(init: RequestInit | undefined): Response {
  const body = JSON.parse(String(init?.body)) as {
    items: { clientContributionId: string }[];
  };
  return jsonResponse({
    accepted: {
      count: body.items.length,
      ids: body.items.map((item) => item.clientContributionId),
    },
    duplicates: { count: 0, ids: [] },
    rejected: { count: 0, items: [] },
  });
}

function queue(
  storage: MemoryStorage,
  userId = "user-a",
): StoredEntry[] {
  const raw = storage.getItem(outboxStorageKey(userId));
  return raw ? (JSON.parse(raw) as StoredEntry[]) : [];
}

let storage: MemoryStorage;
let uuidCounter: number;
let now: Date;

function options(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-a",
    authenticated: true,
    consentStatus: "granted" as const,
    consentVersion: "1.0",
    storage,
    randomUUID: () => {
      uuidCounter += 1;
      return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
    },
    now: () => now,
    ...overrides,
  };
}

beforeEach(() => {
  storage = new MemoryStorage();
  uuidCounter = 0;
  now = new Date("2026-11-05T12:00:00.000Z");
  vi.clearAllMocks();
});

describe("enqueueContribution", () => {
  it("не ставит в очередь без granted", () => {
    enqueueContribution(mnemonic(), options({ consentStatus: "declined" }));

    expect(queue(storage)).toHaveLength(0);
  });

  it("не ставит в очередь без авторизации или пользователя", () => {
    enqueueContribution(mnemonic(), options({ authenticated: false }));
    enqueueContribution(mnemonic(), options({ userId: null }));

    expect(queue(storage)).toHaveLength(0);
  });

  it("сохраняет только текст и идентификаторы без медиа", () => {
    enqueueContribution(mnemonic(), options());

    const [entry] = queue(storage);
    expect(entry).toBeTruthy();
    const payload = entry.payload as unknown as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual([
      "clientContributionId",
      "consentVersion",
      "cueWord",
      "locale",
      "meaningId",
      "sceneText",
      "sourceMnemonicId",
      "submittedAt",
      "wordId",
    ]);
    expect(payload).not.toHaveProperty("image");
    expect(payload).not.toHaveProperty("localUri");
    expect(payload).not.toHaveProperty("fileName");
    expect(payload).not.toHaveProperty("base64");
  });

  it("идемпотентен для одной ревизии и заменяет снимок при обновлении", () => {
    const first = mnemonic();
    enqueueContribution(first, options());
    const originalId = queue(storage)[0].payload.clientContributionId;

    enqueueContribution(first, options());
    expect(queue(storage)).toHaveLength(1);
    expect(queue(storage)[0].payload.clientContributionId).toBe(originalId);

    enqueueContribution(
      mnemonic({
        cueWord: "Братик",
        updatedAt: "2026-11-05T11:30:00.000Z",
        rev: 2,
      }),
      options(),
    );

    expect(queue(storage)).toHaveLength(1);
    const payload = queue(storage)[0].payload as unknown as {
      cueWord: string;
      submittedAt: string;
      clientContributionId: string;
    };
    expect(payload.cueWord).toBe("Братик");
    expect(payload.submittedAt).toBe("2026-11-05T11:30:00.000Z");
    expect(payload.clientContributionId).not.toBe(originalId);
  });

  it("хранит очереди разных пользователей отдельно", () => {
    enqueueContribution(mnemonic(), options());
    enqueueContribution(mnemonic({ id: "usr-b" }), options({ userId: "user-b" }));

    expect(queue(storage, "user-a")).toHaveLength(1);
    expect(queue(storage, "user-b")).toHaveLength(1);
  });
});

describe("scoping, clear and reset", () => {
  it("очищает неотправленные записи без userId во всех очередях", () => {
    enqueueContribution(mnemonic(), options());
    enqueueContribution(
      mnemonic({ id: "usr-b" }),
      options({ userId: "user-b" }),
    );

    clearPendingOutbox(options({ userId: null }));

    expect(queue(storage, "user-a")).toHaveLength(0);
    expect(queue(storage, "user-b")).toHaveLength(0);
  });

  it("сохраняет rejected при очистке, удаляя pending и blocked", () => {
    enqueueContribution(mnemonic({ id: "usr-1" }), options());
    enqueueContribution(mnemonic({ id: "usr-2" }), options());
    enqueueContribution(mnemonic({ id: "usr-3" }), options());
    const entries = queue(storage);
    entries[0].status = "rejected";
    entries[1].status = "blocked";
    storage.setItem(outboxStorageKey("user-a"), JSON.stringify(entries));

    clearPendingOutbox(options());

    expect(queue(storage)).toHaveLength(1);
    expect(queue(storage)[0].status).toBe("rejected");
  });

  it("возвращает blocked в pending после нового согласия", () => {
    enqueueContribution(mnemonic(), options());
    const entries = queue(storage);
    entries[0].status = "blocked";
    entries[0].attemptCount = 3;
    entries[0].nextAttemptAt = "2026-11-05T13:00:00.000Z";
    storage.setItem(outboxStorageKey("user-a"), JSON.stringify(entries));

    resetBlockedOutbox(options());

    expect(queue(storage)[0].status).toBe("pending");
    expect(queue(storage)[0].attemptCount).toBe(0);
    expect(queue(storage)[0].nextAttemptAt).toBeNull();
  });

  it("clearOutboxStorage удаляет все ключи очередей", () => {
    enqueueContribution(mnemonic(), options());
    enqueueContribution(
      mnemonic({ id: "usr-b" }),
      options({ userId: "user-b" }),
    );

    clearOutboxStorage(options({ userId: null }));

    expect(storage.getItem(outboxStorageKey("user-a"))).toBeNull();
    expect(storage.getItem(outboxStorageKey("user-b"))).toBeNull();
  });
});

describe("flushOutbox", () => {
  it("разбивает 51 запись на два батча и удаляет отправленные", async () => {
    for (let index = 0; index < 51; index += 1) {
      enqueueContribution(
        mnemonic({
          id: `usr-${index}`,
          cueWord: `Созвучие ${index}`,
          sceneText: `Сцена номер ${index}`,
          updatedAt: `2026-11-05T10:00:${String(index).padStart(2, "0")}.000Z`,
        }),
        options(),
      );
    }

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      acceptedFor(init),
    );

    await expect(
      flushOutbox(options({ fetch: fetchMock })),
    ).resolves.toEqual({ sent: 51, failed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(firstBody.items).toHaveLength(50);
    expect(secondBody.items).toHaveLength(1);
    expect(queue(storage)).toHaveLength(0);
  });

  it("останавливает очередь и помечает записи при 403", async () => {
    enqueueContribution(mnemonic({ id: "usr-1" }), options());
    enqueueContribution(mnemonic({ id: "usr-2" }), options());
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "CONSENT_REQUIRED" }, 403),
    );

    await expect(
      flushOutbox(options({ fetch: fetchMock })),
    ).resolves.toEqual({ sent: 0, failed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queue(storage).map((entry) => entry.status)).toEqual([
      "blocked",
      "blocked",
    ]);

    await flushOutbox(options({ fetch: fetchMock }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("не отправляет и не меняет очередь без granted", async () => {
    enqueueContribution(mnemonic(), options());
    const fetchMock = vi.fn();

    await expect(
      flushOutbox(options({ fetch: fetchMock, consentStatus: "withdrawn" })),
    ).resolves.toEqual({ sent: 0, failed: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queue(storage)).toHaveLength(1);
  });

  it("не воскрешает очередь, очищенную во время запроса", async () => {
    enqueueContribution(mnemonic(), options());
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const flushing = flushOutbox(options({ fetch: fetchMock }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    clearPendingOutbox(options({ consentStatus: "withdrawn" }));

    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    ) as { items: { clientContributionId: string }[] };
    resolveFetch(
      jsonResponse({
        accepted: {
          count: 1,
          ids: body.items.map((item) => item.clientContributionId),
        },
        duplicates: { count: 0, ids: [] },
        rejected: { count: 0, items: [] },
      }),
    );

    await expect(flushing).resolves.toEqual({ sent: 1, failed: 0 });
    expect(queue(storage)).toHaveLength(0);
  });

  it("не удаляет новую ревизию, заменённую во время запроса", async () => {
    enqueueContribution(mnemonic(), options());
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const flushing = flushOutbox(options({ fetch: fetchMock }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    enqueueContribution(
      mnemonic({
        cueWord: "Братик",
        updatedAt: "2026-11-05T11:30:00.000Z",
        rev: 2,
      }),
      options(),
    );

    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    ) as { items: { clientContributionId: string }[] };
    resolveFetch(
      jsonResponse({
        accepted: {
          count: 1,
          ids: body.items.map((item) => item.clientContributionId),
        },
        duplicates: { count: 0, ids: [] },
        rejected: { count: 0, items: [] },
      }),
    );

    await expect(flushing).resolves.toEqual({ sent: 1, failed: 0 });
    expect(queue(storage)).toHaveLength(1);
    expect(queue(storage)[0].payload.cueWord).toBe("Братик");
  });

  it("увеличивает счётчик попыток и откладывает повтор с backoff", async () => {
    enqueueContribution(mnemonic(), options());
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async () => jsonResponse({ error: "DOWN" }, 503));

    await expect(
      flushOutbox(options({ fetch: fetchMock })),
    ).resolves.toEqual({ sent: 0, failed: 1 });

    const [failed] = queue(storage);
    expect(failed.attemptCount).toBe(1);
    expect(Date.parse(failed.nextAttemptAt ?? "")).toBeGreaterThan(
      now.getTime(),
    );

    now = new Date(now.getTime() + 30_000);
    await flushOutbox(options({ fetch: fetchMock }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = new Date(now.getTime() + 31_000);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      acceptedFor(init),
    );
    await expect(
      flushOutbox(options({ fetch: fetchMock })),
    ).resolves.toEqual({ sent: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queue(storage)).toHaveLength(0);
  });
});

describe("submitWithdrawal", () => {
  it("очищает очередь и отправляет идентификаторы", async () => {
    enqueueContribution(mnemonic({ id: "usr-1" }), options());
    enqueueContribution(mnemonic({ id: "usr-2" }), options());
    const fetchMock = vi.fn(async () => jsonResponse({ count: 2 }));

    await submitWithdrawal(["usr-1", "usr-2"], options({ fetch: fetchMock }));

    expect(queue(storage)).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mnemonic-contributions/withdraw",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ sourceMnemonicIds: ["usr-1", "usr-2"] }),
      },
    );
  });

  it("clearPendingOutbox удаляет неотправленные записи", () => {
    enqueueContribution(mnemonic(), options());

    clearPendingOutbox(options());

    expect(queue(storage)).toHaveLength(0);
  });
});

describe("resumeOutboxAfterGrant", () => {
  it("сбрасывает blocked и отправляет после успешного согласия", async () => {
    enqueueContribution(mnemonic(), options());
    const entries = queue(storage);
    entries[0].status = "blocked";
    entries[0].attemptCount = 2;
    storage.setItem(outboxStorageKey("user-a"), JSON.stringify(entries));
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async (_url, init) => acceptedFor(init));

    await resumeOutboxAfterGrant(options({ fetch: fetchMock }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queue(storage)).toHaveLength(0);
  });

  it("не сбрасывает и не отправляет без granted", async () => {
    enqueueContribution(mnemonic(), options());
    const entries = queue(storage);
    entries[0].status = "blocked";
    storage.setItem(outboxStorageKey("user-a"), JSON.stringify(entries));
    const fetchMock = vi.fn();

    await resumeOutboxAfterGrant(
      options({ fetch: fetchMock, consentStatus: "withdrawn" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queue(storage)[0].status).toBe("blocked");
  });
});
