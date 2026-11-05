import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

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

type StoredAudit = {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  createdAt: Date;
};

type MockQuery = {
  where(condition: unknown): MockQuery;
  orderBy(...columns: unknown[]): MockQuery;
  limit(value: number): MockQuery;
  offset(value: number): MockQuery;
  groupBy(...columns: unknown[]): MockQuery;
  then(
    onFulfilled?: ((value: unknown[]) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ): Promise<unknown>;
};

const STATUSES = ["pending", "approved", "rejected", "duplicate", "withdrawn"];

const mocks = vi.hoisted(() => {
  const contributions = new Map<string, StoredContribution>();
  const audits = new Map<string, StoredAudit>();
  const getServerSession = vi.fn();

  function tableName(table: unknown): string {
    return String(
      (table as Record<symbol, string>)[Symbol.for("drizzle:Name")],
    );
  }

  function queryParams(condition: unknown): unknown[] {
    return new PgDialect().sqlToQuery(condition as SQL).params;
  }

  function contributionRowsFor(table: unknown): StoredContribution[] {
    return tableName(table) === "mnemonic_contributions"
      ? [...contributions.values()]
      : [];
  }

  function filterRows(
    rows: StoredContribution[],
    params: unknown[],
  ): StoredContribution[] {
    if (params.length === 0) return rows;
    if (params.length === 1) {
      const value = String(params[0]);
      if (STATUSES.includes(value)) {
        return rows.filter((row) => row.status === value);
      }
      return rows.filter((row) => row.id === value);
    }
    if (params.every((value) => typeof value === "number")) {
      const wordIds = params as number[];
      return rows.filter((row) => wordIds.includes(row.wordId));
    }
    return [];
  }

  const db = {
    select(projection?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          const baseRows = contributionRowsFor(table);
          const projectionKeys = projection ? Object.keys(projection) : [];
          const mode = projectionKeys.includes("value")
            ? projectionKeys.includes("wordId")
              ? "groups"
              : "count"
            : "rows";

          let rows = baseRows.slice();
          let limitValue: number | null = null;
          let offsetValue = 0;

          const builder: MockQuery = {
            where(condition: unknown) {
              rows = filterRows(baseRows, queryParams(condition));
              return builder;
            },
            orderBy() {
              rows = rows
                .slice()
                .sort(
                  (left, right) =>
                    right.submittedAt.getTime() - left.submittedAt.getTime() ||
                    right.createdAt.getTime() - left.createdAt.getTime(),
                );
              return builder;
            },
            limit(value: number) {
              limitValue = value;
              return builder;
            },
            offset(value: number) {
              offsetValue = value;
              return builder;
            },
            groupBy() {
              return builder;
            },
            then(
              onFulfilled?: ((value: unknown[]) => unknown) | null,
              onRejected?: ((reason: unknown) => unknown) | null,
            ) {
              let value: unknown[];
              if (mode === "count") {
                value = [{ value: rows.length }];
              } else if (mode === "groups") {
                const groups = new Map<
                  string,
                  { wordId: number; normalizedHash: string; value: number }
                >();
                for (const row of rows) {
                  const key = `${row.wordId}\u0000${row.normalizedHash}`;
                  const current = groups.get(key);
                  if (current) {
                    current.value += 1;
                  } else {
                    groups.set(key, {
                      wordId: row.wordId,
                      normalizedHash: row.normalizedHash,
                      value: 1,
                    });
                  }
                }
                value = [...groups.values()];
              } else {
                const end =
                  limitValue === null
                    ? undefined
                    : offsetValue + limitValue;
                value = rows
                  .slice(offsetValue, end)
                  .map((row) => ({ ...row }));
              }
              return Promise.resolve(value).then(onFulfilled, onRejected);
            },
          };
          return builder;
        },
      };
    },
    insert(table: unknown) {
      return {
        values(value: StoredAudit | StoredAudit[]) {
          if (tableName(table) === "audit_log") {
            for (const row of Array.isArray(value) ? value : [value]) {
              audits.set(row.id, row);
            }
          }
          return Promise.resolve();
        },
      };
    },
    update(table: unknown) {
      return {
        set(changes: Partial<StoredContribution>) {
          return {
            where(condition: unknown) {
              return {
                async returning() {
                  if (tableName(table) !== "mnemonic_contributions") return [];
                  const [id] = queryParams(condition).map(String);
                  const row = contributions.get(id);
                  if (!row) return [];
                  const updated = { ...row, ...changes };
                  contributions.set(id, updated);
                  return [{ ...updated }];
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
    contributions,
    audits,
    getServerSession,
    db,
    reset() {
      vi.clearAllMocks();
      contributions.clear();
      audits.clear();
    },
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/server/session", () => ({ getServerSession: mocks.getServerSession }));

import { GET as queueGET } from "./route";
import { POST as decisionPOST } from "./[id]/decision/route";

type QueueResponse = {
  items: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};

const adminSession = { user: { id: "admin-1", role: "admin" } };
const userSession = { user: { id: "user-a", role: "user" } };

function queueRequest(query = ""): Request {
  return new Request(`http://localhost/api/admin/mnemonic-contributions${query}`);
}

function decisionRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/admin/mnemonic-contributions/contribution-1/decision",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

function decisionContext(id = "contribution-1") {
  return { params: Promise.resolve({ id }) };
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
    normalizedHash: "hash-brat",
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
  mocks.getServerSession.mockResolvedValue(adminSession);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/mnemonic-contributions", () => {
  it("returns 401 without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await queueGET(queueRequest());

    expect(response.status).toBe(401);
  });

  it("returns 403 for a non-admin session", async () => {
    mocks.getServerSession.mockResolvedValue(userSession);

    const response = await queueGET(queueRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "FORBIDDEN" });
  });

  it("defaults to pending and accepts an explicit status filter", async () => {
    const pending = seedContribution({ status: "pending" });
    const approved = seedContribution({
      status: "approved",
      submittedAt: new Date("2026-11-04T12:00:00.000Z"),
    });
    seedContribution({ status: "rejected" });

    const defaultResponse = await queueGET(queueRequest());
    const defaultBody = (await defaultResponse.json()) as QueueResponse;
    expect(defaultResponse.status).toBe(200);
    expect(defaultBody.items.map((item) => item.id)).toEqual([pending.id]);
    expect(defaultBody).toMatchObject({ total: 1, limit: 50, offset: 0 });

    const approvedResponse = await queueGET(queueRequest("?status=approved"));
    const approvedBody = (await approvedResponse.json()) as QueueResponse;
    expect(approvedBody.items.map((item) => item.id)).toEqual([approved.id]);
    expect(approvedBody.total).toBe(1);
  });

  it("paginates with limit and offset", async () => {
    const oldest = seedContribution({
      submittedAt: new Date("2026-11-01T12:00:00.000Z"),
    });
    const middle = seedContribution({
      submittedAt: new Date("2026-11-02T12:00:00.000Z"),
    });
    const newest = seedContribution({
      submittedAt: new Date("2026-11-03T12:00:00.000Z"),
    });

    const response = await queueGET(queueRequest("?limit=1&offset=1"));
    const body = (await response.json()) as QueueResponse;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ total: 3, limit: 1, offset: 1 });
    expect(body.items.map((item) => item.id)).toEqual([middle.id]);
    expect(body.items.map((item) => item.id)).not.toContain(oldest.id);
    expect(body.items.map((item) => item.id)).not.toContain(newest.id);
  });

  it.each([
    ["unknown status", "?status=deleted"],
    ["zero limit", "?limit=0"],
    ["limit above maximum", "?limit=201"],
    ["negative offset", "?offset=-1"],
    ["non-numeric limit", "?limit=ten"],
  ])("rejects %s with 400", async (_label, query) => {
    const response = await queueGET(queueRequest(query));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_QUERY" });
  });

  it("returns content, flags, duplicate score and a pseudonymous contributor id", async () => {
    const first = seedContribution({
      wordId: 1,
      normalizedHash: "same-hash",
      cueWord: "Брат",
      sceneText: "Брат светит как фонарь",
      moderationReason: "sensitive_content:email,phone",
      consentVersion: "1.1",
    });
    const duplicate = seedContribution({
      wordId: 1,
      normalizedHash: "same-hash",
      cueWord: "Брат",
      sceneText: "Брат светит как фонарь",
    });
    const other = seedContribution({
      wordId: 2,
      normalizedHash: "other-hash",
      contributorUserId: "user-b",
    });

    const response = await queueGET(queueRequest());
    const body = (await response.json()) as QueueResponse;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(3);
    expect(body.total).toBe(3);
    expect(serialized).not.toContain("user-a");
    expect(serialized).not.toContain("user-b");
    expect(serialized).not.toContain("@");

    const firstItem = body.items.find((item) => item.id === first.id)!;
    expect(firstItem).toMatchObject({
      wordId: 1,
      word: "bright",
      translation: "яркий",
      pronunciation: "брайт",
      cueWord: "Брат",
      sceneText: "Брат светит как фонарь",
      locale: "ru",
      consentVersion: "1.1",
      status: "pending",
      moderationReason: "sensitive_content:email,phone",
      duplicateCount: 1,
      duplicateScore: 1,
      flags: { email: true, phone: true, url: false },
    });
    expect(firstItem.contributorId).toMatch(/^contributor_[0-9a-f]{64}$/);
    expect(firstItem.contributorId).toBe(
      (body.items.find((item) => item.id === duplicate.id)! as { contributorId: string })
        .contributorId,
    );
    expect(firstItem.contributorId).not.toBe(
      (body.items.find((item) => item.id === other.id)! as { contributorId: string })
        .contributorId,
    );
    expect(firstItem.submittedAt).toBe("2026-11-05T12:00:00.000Z");
    expect(firstItem).not.toHaveProperty("email");
    expect(firstItem).not.toHaveProperty("contributorUserId");
    expect(firstItem).not.toHaveProperty("normalizedHash");
    expect(firstItem).not.toHaveProperty("reviewedBy");
    expect(firstItem).not.toHaveProperty("meaningId");
  });

  it("returns an empty page when nothing matches", async () => {
    const response = await queueGET(queueRequest("?status=withdrawn"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
  });
});

describe("POST /api/admin/mnemonic-contributions/:id/decision", () => {
  it("returns 401 without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await decisionPOST(
      decisionRequest({ action: "approve" }),
      decisionContext(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for a non-admin session", async () => {
    const row = seedContribution();
    mocks.getServerSession.mockResolvedValue(userSession);

    const response = await decisionPOST(
      decisionRequest({ action: "approve" }),
      decisionContext(row.id),
    );

    expect(response.status).toBe(403);
    expect(mocks.contributions.get(row.id)?.status).toBe("pending");
    expect(mocks.audits.size).toBe(0);
  });

  it("approves a contribution, preserves sensitive flags and writes an audit row", async () => {
    const row = seedContribution({
      moderationReason: "sensitive_content:email",
      status: "pending",
    });

    const response = await decisionPOST(
      decisionRequest({ action: "approve" }),
      decisionContext(row.id),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: row.id,
      status: "approved",
      moderationReason: "sensitive_content:email",
      reviewedBy: "admin-1",
      idempotent: false,
    });
    expect(body.reviewedAt).toEqual(expect.any(String));

    const stored = mocks.contributions.get(row.id)!;
    expect(stored.status).toBe("approved");
    expect(stored.reviewedBy).toBe("admin-1");
    expect(stored.reviewedAt).toBeInstanceOf(Date);

    const [audit] = [...mocks.audits.values()];
    expect(audit).toMatchObject({
      actorId: "admin-1",
      action: "mnemonic_contribution.approve",
      targetType: "mnemonic_contribution",
      targetId: row.id,
      meta: {
        action: "approve",
        previousStatus: "pending",
        previousReason: "sensitive_content:email",
        status: "approved",
      },
    });
  });

  it("keeps sensitive flags when needs_edit adds a reason", async () => {
    const row = seedContribution({
      moderationReason: "sensitive_content:email,phone",
      status: "pending",
    });

    const response = await decisionPOST(
      decisionRequest({ action: "needs_edit", reason: "Слишком коротко" }),
      decisionContext(row.id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "pending",
      moderationReason: "sensitive_content:email,phone; Слишком коротко",
    });
    expect(mocks.contributions.get(row.id)).toMatchObject({
      status: "pending",
      moderationReason: "sensitive_content:email,phone; Слишком коротко",
      reviewedBy: "admin-1",
    });

    const queue = (await (await queueGET(queueRequest())).json()) as QueueResponse;
    const item = queue.items.find((entry) => entry.id === row.id)!;
    expect(item.flags).toEqual({ email: true, phone: true, url: false });

    const [audit] = [...mocks.audits.values()];
    expect(audit.meta).toMatchObject({
      action: "needs_edit",
      previousReason: "sensitive_content:email,phone",
      previousFlags: { email: true, phone: true, url: false },
      reason: "Слишком коротко",
    });
  });

  it.each(["reject", "needs_edit"])(
    "requires a non-empty reason for %s",
    async (action) => {
      const row = seedContribution();

      const missing = await decisionPOST(
        decisionRequest({ action }),
        decisionContext(row.id),
      );
      const blank = await decisionPOST(
        decisionRequest({ action, reason: "   " }),
        decisionContext(row.id),
      );

      expect(missing.status).toBe(400);
      expect(blank.status).toBe(400);
      expect(mocks.contributions.get(row.id)?.status).toBe("pending");
      expect(mocks.contributions.get(row.id)?.reviewedAt).toBeNull();
      expect(mocks.audits.size).toBe(0);
    },
  );

  it("rejects with a reason and keeps needs_edit pending", async () => {
    const rejectedRow = seedContribution();
    const needsEditRow = seedContribution();

    const rejected = await decisionPOST(
      decisionRequest({ action: "reject", reason: "Не по теме" }),
      decisionContext(rejectedRow.id),
    );
    const needsEdit = await decisionPOST(
      decisionRequest({ action: "needs_edit", reason: "Слишком коротко" }),
      decisionContext(needsEditRow.id),
    );

    expect(rejected.status).toBe(200);
    expect((await rejected.json()).status).toBe("rejected");
    expect(mocks.contributions.get(rejectedRow.id)).toMatchObject({
      status: "rejected",
      moderationReason: "Не по теме",
      reviewedBy: "admin-1",
    });

    expect(needsEdit.status).toBe(200);
    expect((await needsEdit.json()).status).toBe("pending");
    expect(mocks.contributions.get(needsEditRow.id)).toMatchObject({
      status: "pending",
      moderationReason: "Слишком коротко",
      reviewedBy: "admin-1",
    });
    expect(mocks.audits.size).toBe(2);
  });

  it("marks duplicate and withdraws idempotently", async () => {
    const duplicateRow = seedContribution();
    const withdrawRow = seedContribution();

    const duplicate = await decisionPOST(
      decisionRequest({ action: "duplicate", reason: "Повтор" }),
      decisionContext(duplicateRow.id),
    );
    expect((await duplicate.json()).status).toBe("duplicate");
    expect(mocks.contributions.get(duplicateRow.id)?.moderationReason).toBe("Повтор");

    const first = await decisionPOST(
      decisionRequest({ action: "withdraw" }),
      decisionContext(withdrawRow.id),
    );
    const firstBody = await first.json();
    const firstReviewedAt = mocks.contributions.get(withdrawRow.id)?.reviewedAt;

    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({ status: "withdrawn", idempotent: false });

    const second = await decisionPOST(
      decisionRequest({ action: "withdraw" }),
      decisionContext(withdrawRow.id),
    );
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody).toMatchObject({ status: "withdrawn", idempotent: true });
    expect(mocks.contributions.get(withdrawRow.id)?.status).toBe("withdrawn");
    expect(mocks.contributions.get(withdrawRow.id)?.reviewedAt).toBe(
      firstReviewedAt,
    );

    const withdrawAudits = [...mocks.audits.values()].filter(
      (audit) => audit.targetId === withdrawRow.id,
    );
    expect(withdrawAudits).toHaveLength(2);
    expect(withdrawAudits[1].meta).toMatchObject({ idempotent: true });
  });

  it("returns 409 when approving a withdrawn contribution", async () => {
    const row = seedContribution({ status: "withdrawn" });

    const response = await decisionPOST(
      decisionRequest({ action: "approve" }),
      decisionContext(row.id),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "WITHDRAWN_TERMINAL" });
    expect(mocks.contributions.get(row.id)?.status).toBe("withdrawn");
    expect(mocks.contributions.get(row.id)?.reviewedBy).toBeNull();
    expect(mocks.audits.size).toBe(0);
  });

  it.each(["approve", "reject", "duplicate", "needs_edit"] as const)(
    "returns 409 for %s on a withdrawn contribution",
    async (action) => {
      const row = seedContribution({ status: "withdrawn" });
      const reason =
        action === "reject" || action === "needs_edit" ? "Причина" : undefined;

      const response = await decisionPOST(
        decisionRequest({ action, ...(reason ? { reason } : {}) }),
        decisionContext(row.id),
      );

      expect(response.status).toBe(409);
      expect(mocks.contributions.get(row.id)?.status).toBe("withdrawn");
      expect(mocks.audits.size).toBe(0);
    },
  );

  it("does not affect other contributions or owner operations", async () => {
    const target = seedContribution({
      status: "pending",
      contributorUserId: "user-a",
    });
    const sibling = seedContribution({
      status: "pending",
      contributorUserId: "user-b",
      normalizedHash: "another-hash",
    });

    await decisionPOST(
      decisionRequest({ action: "approve" }),
      decisionContext(target.id),
    );

    expect(mocks.contributions.get(sibling.id)).toMatchObject({
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      contributorUserId: "user-b",
    });
    expect(mocks.contributions.get(target.id)?.contributorUserId).toBe("user-a");
  });

  it("returns 404 for an unknown contribution and writes no audit row", async () => {
    const response = await decisionPOST(
      decisionRequest({ action: "approve" }),
      decisionContext("missing-id"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
    expect(mocks.audits.size).toBe(0);
  });

  it.each([
    ["unknown action", { action: "publish" }],
    ["extra field", { action: "approve", userId: "user-b" }],
    ["malformed json", "{"],
    ["missing action", {}],
  ])("rejects %s with 400", async (_label, body) => {
    const row = seedContribution();

    const response = await decisionPOST(
      decisionRequest(body),
      decisionContext(row.id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_BODY" });
    expect(mocks.contributions.get(row.id)?.status).toBe("pending");
    expect(mocks.audits.size).toBe(0);
  });
});
