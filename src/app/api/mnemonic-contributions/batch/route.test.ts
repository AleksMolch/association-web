import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

type StoredPreference = {
  userId: string;
  status: string;
  consentVersion: string | null;
  decidedAt: Date | null;
  nextPromptAt: Date | null;
  updatedAt: Date;
};

type StoredContribution = {
  id: string;
  clientContributionId: string;
  contributorUserId: string | null;
  sourceMnemonicId: string | null;
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
  locale: string;
  consentVersion: string;
  submittedAt: Date;
  status: string;
  normalizedHash: string;
  moderationReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

const mocks = vi.hoisted(() => {
  const preferences = new Map<string, StoredPreference>();
  const contributions = new Map<string, StoredContribution>();
  const getServerSession = vi.fn();
  const state: { insertError: Error | null } = { insertError: null };

  function tableName(table: unknown): string {
    return String(
      (table as Record<symbol, string>)[Symbol.for("drizzle:Name")],
    );
  }

  function queryParams(condition: unknown): unknown[] {
    return new PgDialect().sqlToQuery(condition as SQL).params;
  }

  const db = {
    select() {
      return {
        from(table: unknown) {
          return {
            where(condition: unknown) {
              const name = tableName(table);
              const params = queryParams(condition);

              if (name === "contribution_preferences") {
                const row = preferences.get(String(params[0]));
                return Promise.resolve(row ? [row] : []);
              }

              const rows = [...contributions.values()];
              if (params.length === 2) {
                const [userId, clientContributionId] = params;
                return Promise.resolve(
                  rows.filter(
                    (row) =>
                      row.contributorUserId === userId &&
                      row.clientContributionId === clientContributionId,
                  ),
                );
              }
              if (params.length === 3) {
                const [userId, wordId, normalizedHash] = params;
                return Promise.resolve(
                  rows.filter(
                    (row) =>
                      row.contributorUserId === userId &&
                      row.wordId === wordId &&
                      row.normalizedHash === normalizedHash,
                  ),
                );
              }

              return Promise.resolve([]);
            },
          };
        },
      };
    },
    insert() {
      return {
        values(values: StoredContribution | StoredContribution[]) {
          const rows = Array.isArray(values) ? values : [values];
          return {
            onConflictDoNothing() {
              return {
                async returning() {
                  if (state.insertError) throw state.insertError;

                  const inserted: { clientContributionId: string }[] = [];
                  for (const row of rows) {
                    const exists = [...contributions.values()].some(
                      (stored) =>
                        stored.contributorUserId === row.contributorUserId &&
                        stored.clientContributionId === row.clientContributionId,
                    );
                    if (exists) continue;

                    const stored: StoredContribution = {
                      ...row,
                      moderationReason: row.moderationReason ?? null,
                      reviewedBy: null,
                      reviewedAt: null,
                      createdAt: row.createdAt ?? new Date(),
                    };
                    contributions.set(stored.id, stored);
                    inserted.push({
                      clientContributionId: stored.clientContributionId,
                    });
                  }
                  return inserted;
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(changes: Partial<StoredContribution>) {
          return {
            where(condition: unknown) {
              return {
                async returning() {
                  const params = queryParams(condition);
                  const statuses = ["pending", "approved", "duplicate"];
                  const userId = String(params[0]);
                  const sourceIds = params
                    .slice(1, params.length - statuses.length)
                    .map(String);
                  const allowedStatuses = new Set(statuses);
                  const updated: { id: string }[] = [];

                  for (const row of contributions.values()) {
                    if (
                      row.contributorUserId === userId &&
                      row.sourceMnemonicId !== null &&
                      sourceIds.includes(row.sourceMnemonicId) &&
                      allowedStatuses.has(row.status)
                    ) {
                      Object.assign(row, changes);
                      updated.push({ id: row.id });
                    }
                  }

                  return updated;
                },
              };
            },
          };
        },
      };
    },
    async transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      return callback(db);
    },
  };

  return {
    preferences,
    contributions,
    state,
    getServerSession,
    db,
    reset() {
      vi.clearAllMocks();
      preferences.clear();
      contributions.clear();
      state.insertError = null;
    },
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/server/session", () => ({ getServerSession: mocks.getServerSession }));

import {
  CONTRIBUTION_BATCH_LIMIT,
  resetContributionRateLimitForTests,
} from "@/lib/server/contribution-rate-limit";
import { POST as batchPOST } from "./route";
import { POST as withdrawPOST } from "../withdraw/route";

type ContributionItem = {
  clientContributionId: string;
  sourceMnemonicId: string;
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
  locale: "ru";
  consentVersion: string;
  submittedAt: string;
};

const session = { user: { id: "user-a" } };

function makeItem(overrides: Partial<ContributionItem> = {}): ContributionItem {
  return {
    clientContributionId: crypto.randomUUID(),
    sourceMnemonicId: `usr-${crypto.randomUUID()}`,
    wordId: 1,
    meaningId: "meaning-1",
    cueWord: "Брат",
    sceneText: `Брат похож на брата ${crypto.randomUUID()}`,
    locale: "ru",
    consentVersion: "1.0",
    submittedAt: "2026-11-05T12:00:00.000Z",
    ...overrides,
  };
}

function batchRequest(body: unknown): Request {
  return new Request("http://localhost/api/mnemonic-contributions/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function withdrawRequest(body: unknown): Request {
  return new Request("http://localhost/api/mnemonic-contributions/withdraw", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function grantConsent(userId = "user-a", status = "granted") {
  mocks.preferences.set(userId, {
    userId,
    status,
    consentVersion: "1.0",
    decidedAt: new Date("2026-11-05T11:00:00.000Z"),
    nextPromptAt: null,
    updatedAt: new Date("2026-11-05T11:00:00.000Z"),
  });
}

function seedContribution(
  overrides: Partial<StoredContribution> = {},
): StoredContribution {
  const row: StoredContribution = {
    id: crypto.randomUUID(),
    clientContributionId: crypto.randomUUID(),
    contributorUserId: "user-a",
    sourceMnemonicId: "usr-1",
    wordId: 1,
    meaningId: "meaning-1",
    cueWord: "Брат",
    sceneText: "Брат похож на брата",
    locale: "ru",
    consentVersion: "1.0",
    submittedAt: new Date("2026-11-05T12:00:00.000Z"),
    status: "pending",
    normalizedHash: crypto.randomUUID(),
    moderationReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date("2026-11-05T12:00:00.000Z"),
    ...overrides,
  };
  mocks.contributions.set(row.id, row);
  return row;
}

beforeEach(() => {
  mocks.reset();
  resetContributionRateLimitForTests();
  mocks.getServerSession.mockResolvedValue(session);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/mnemonic-contributions/batch authentication and consent", () => {
  it("returns 401 without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await batchPOST(batchRequest({ items: [makeItem()] }));

    expect(response.status).toBe(401);
    expect(mocks.contributions.size).toBe(0);
  });

  it.each(["unset", "declined", "ask_later", "withdrawn"])(
    "returns 403 when the server preference is %s",
    async (status) => {
      if (status !== "unset") grantConsent("user-a", status);

      const response = await batchPOST(batchRequest({ items: [makeItem()] }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "CONSENT_REQUIRED" });
      expect(mocks.contributions.size).toBe(0);
    },
  );
});

describe("POST /api/mnemonic-contributions/batch validation", () => {
  beforeEach(() => {
    grantConsent();
  });

  it.each(["image", "uri", "fileName", "base64"])(
    "rejects an item with an extra media field %s",
    async (extraKey) => {
      const item = { ...makeItem(), [extraKey]: "local-photo.jpg" };

      const response = await batchPOST(batchRequest({ items: [item] }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "INVALID_BODY" });
      expect(mocks.contributions.size).toBe(0);
    },
  );

  it("rejects extra top-level fields", async () => {
    const response = await batchPOST(
      batchRequest({ items: [makeItem()], userId: "user-b" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.contributions.size).toBe(0);
  });

  it("rejects more than 50 items", async () => {
    const items = Array.from({ length: 51 }, () => makeItem());

    const response = await batchPOST(batchRequest({ items }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_BODY" });
    expect(mocks.contributions.size).toBe(0);
  });

  it("rejects malformed JSON and an empty item list", async () => {
    expect((await batchPOST(batchRequest("{"))).status).toBe(400);
    expect((await batchPOST(batchRequest({ items: [] }))).status).toBe(400);
  });
});

describe("POST /api/mnemonic-contributions/batch insertion", () => {
  beforeEach(() => {
    grantConsent();
  });

  it("inserts text-only contributions with normalized text, hash and pending status", async () => {
    const first = makeItem({
      sourceMnemonicId: "usr-not-a-uuid-but-valid",
      cueWord: "  Брат  ",
      sceneText: "  Брат   похож\nна брата  ",
    });
    const second = makeItem({
      wordId: 2,
      cueWord: "Дом",
      sceneText: "Дом стоит у реки",
    });

    const response = await batchPOST(
      batchRequest({ items: [first, second] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: {
        count: 2,
        ids: [first.clientContributionId, second.clientContributionId],
      },
      duplicates: { count: 0, ids: [] },
      rejected: { count: 0, items: [] },
    });

    const rows = [...mocks.contributions.values()];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      contributorUserId: "user-a",
      sourceMnemonicId: "usr-not-a-uuid-but-valid",
      wordId: 1,
      cueWord: "Брат",
      sceneText: "Брат похож на брата",
      status: "pending",
      moderationReason: null,
    });
    expect(rows[0].normalizedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[1].normalizedHash).not.toBe(rows[0].normalizedHash);
  });

  it("rejects unknown words without inserting them or aborting the batch", async () => {
    const unknown = makeItem({ wordId: 999_999 });
    const valid = makeItem({ wordId: 2, sceneText: "Дом стоит у реки" });

    const response = await batchPOST(
      batchRequest({ items: [unknown, valid] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: { count: 1, ids: [valid.clientContributionId] },
      duplicates: { count: 0, ids: [] },
      rejected: {
        count: 1,
        items: [
          {
            clientContributionId: unknown.clientContributionId,
            reason: "unknown_word",
          },
        ],
      },
    });
    expect(mocks.contributions.size).toBe(1);
    expect([...mocks.contributions.values()][0].wordId).toBe(2);
  });

  it("is idempotent by clientContributionId and detects duplicate hashes", async () => {
    const original = makeItem({ cueWord: "Брат", sceneText: "Брат похож на брата" });

    const first = await batchPOST(batchRequest({ items: [original] }));
    expect((await first.json()).accepted.count).toBe(1);

    const repeated = await batchPOST(batchRequest({ items: [original] }));
    expect(await repeated.json()).toEqual({
      accepted: { count: 0, ids: [] },
      duplicates: { count: 1, ids: [original.clientContributionId] },
      rejected: { count: 0, items: [] },
    });

    const sameTextNewClientId = makeItem({
      cueWord: "  БРАТ ",
      sceneText: "Брат   похож на брата",
    });
    const hashDuplicate = await batchPOST(
      batchRequest({ items: [sameTextNewClientId] }),
    );

    expect(await hashDuplicate.json()).toEqual({
      accepted: { count: 0, ids: [] },
      duplicates: { count: 1, ids: [sameTextNewClientId.clientContributionId] },
      rejected: { count: 0, items: [] },
    });
    expect(mocks.contributions.size).toBe(1);
  });

  it("deduplicates repeated ids and hashes inside one batch", async () => {
    const item = makeItem({
      cueWord: "Брат",
      sceneText: "Брат похож на брата",
    });
    const sameHash = makeItem({
      cueWord: "брат",
      sceneText: "Брат похож   на брата",
    });

    const response = await batchPOST(
      batchRequest({ items: [item, item, sameHash] }),
    );

    expect(await response.json()).toEqual({
      accepted: { count: 1, ids: [item.clientContributionId] },
      duplicates: {
        count: 2,
        ids: [item.clientContributionId, sameHash.clientContributionId],
      },
      rejected: { count: 0, items: [] },
    });
    expect(mocks.contributions.size).toBe(1);
  });

  it("keeps suspicious PII items pending with a moderation flag", async () => {
    const item = makeItem({
      cueWord: "Брат",
      sceneText:
        "Пиши на test@example.com, сайт example.org или звони +7 999 123 45 67",
    });

    const response = await batchPOST(batchRequest({ items: [item] }));

    expect(response.status).toBe(200);
    expect((await response.json()).accepted.count).toBe(1);

    const [row] = [...mocks.contributions.values()];
    expect(row.status).toBe("pending");
    expect(row.moderationReason).toContain("email");
    expect(row.moderationReason).toContain("url");
    expect(row.moderationReason).toContain("phone");
    expect(row.status).not.toBe("approved");
  });

  it("does not log cue or scene text on success or failure", async () => {
    const marker = `уникальная-сцена-${crypto.randomUUID()}`;
    const item = makeItem({ sceneText: marker });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect((await batchPOST(batchRequest({ items: [item] }))).status).toBe(200);

    mocks.state.insertError = new Error(`insert failed for ${marker}`);
    expect(
      (
        await batchPOST(
          batchRequest({ items: [makeItem({ sceneText: `${marker} повтор` })] }),
        )
      ).status,
    ).toBe(503);

    const logged = [...errorSpy.mock.calls, ...warnSpy.mock.calls, ...logSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join(" ");
    expect(logged).not.toContain(marker);
  });

  it("returns 429 after the per-user hourly batch limit", async () => {
    for (let index = 0; index < CONTRIBUTION_BATCH_LIMIT; index += 1) {
      const response = await batchPOST(
        batchRequest({ items: [makeItem({ sceneText: `Сцена номер ${index}` })] }),
      );
      expect(response.status).toBe(200);
    }

    const limited = await batchPOST(
      batchRequest({ items: [makeItem({ sceneText: "Ещё одна сцена" })] }),
    );

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "RATE_LIMITED" });
    expect(mocks.contributions.size).toBe(CONTRIBUTION_BATCH_LIMIT);
  });
});

describe("POST /api/mnemonic-contributions/withdraw", () => {
  it("returns 401 without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await withdrawPOST(
      withdrawRequest({ sourceMnemonicIds: ["usr-1"] }),
    );

    expect(response.status).toBe(401);
  });

  it("withdraws only the owner's pending, approved and duplicate rows", async () => {
    const ownPending = seedContribution({ sourceMnemonicId: "usr-1", status: "pending" });
    const ownApproved = seedContribution({ sourceMnemonicId: "usr-1", status: "approved" });
    const ownDuplicate = seedContribution({ sourceMnemonicId: "usr-2", status: "duplicate" });
    const ownRejected = seedContribution({ sourceMnemonicId: "usr-2", status: "rejected" });
    const ownAlreadyWithdrawn = seedContribution({
      sourceMnemonicId: "usr-3",
      status: "withdrawn",
    });
    const foreign = seedContribution({
      contributorUserId: "user-b",
      sourceMnemonicId: "usr-1",
      status: "pending",
    });

    const response = await withdrawPOST(
      withdrawRequest({ sourceMnemonicIds: ["usr-1", "usr-2", "usr-3"] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 3 });
    expect(mocks.contributions.get(ownPending.id)?.status).toBe("withdrawn");
    expect(mocks.contributions.get(ownApproved.id)?.status).toBe("withdrawn");
    expect(mocks.contributions.get(ownDuplicate.id)?.status).toBe("withdrawn");
    expect(mocks.contributions.get(ownRejected.id)?.status).toBe("rejected");
    expect(mocks.contributions.get(ownAlreadyWithdrawn.id)?.status).toBe(
      "withdrawn",
    );
    expect(mocks.contributions.get(foreign.id)?.status).toBe("pending");
  });

  it("returns zero for ids that do not belong to the owner", async () => {
    seedContribution({
      contributorUserId: "user-b",
      sourceMnemonicId: "usr-foreign",
      status: "pending",
    });

    const response = await withdrawPOST(
      withdrawRequest({ sourceMnemonicIds: ["usr-foreign"] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 0 });
  });

  it.each([
    ["more than 200 ids", { sourceMnemonicIds: Array.from({ length: 201 }, (_, index) => `usr-${index}`) }],
    ["empty id", { sourceMnemonicIds: [""] }],
    ["non-string id", { sourceMnemonicIds: [42] }],
    ["extra field", { sourceMnemonicIds: ["usr-1"], userId: "user-b" }],
  ])("rejects %s with 400", async (_label, body) => {
    const response = await withdrawPOST(withdrawRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_BODY" });
  });
});
