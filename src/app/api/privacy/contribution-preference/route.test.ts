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

type InsertRecord = {
  values: StoredPreference;
  set: Record<string, unknown>;
};

const mocks = vi.hoisted(() => {
  const rows = new Map<string, StoredPreference>();
  const inserts: InsertRecord[] = [];
  const getServerSession = vi.fn();

  const db = {
    select() {
      return {
        from() {
          return {
            where(where: unknown) {
              const { params } = new PgDialect().sqlToQuery(where as SQL);
              const row = rows.get(String(params[0]));
              return Promise.resolve(row ? [row] : []);
            },
          };
        },
      };
    },
    insert() {
      return {
        values(values: StoredPreference) {
          return {
            onConflictDoUpdate(config: { target: unknown; set: Record<string, unknown> }) {
              inserts.push({ values, set: config.set });
              const existing = rows.get(values.userId);
              rows.set(values.userId, existing ? { ...existing, ...config.set } : values);
              return Promise.resolve();
            },
          };
        },
      };
    },
  };

  return {
    rows,
    inserts,
    getServerSession,
    db,
    reset() {
      vi.clearAllMocks();
      rows.clear();
      inserts.length = 0;
    },
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/server/session", () => ({ getServerSession: mocks.getServerSession }));

import { GET, PUT } from "./route";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const session = { user: { id: "user-a" } };

function putRequest(body: unknown) {
  return new Request("http://localhost/api/privacy/contribution-preference", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectedPreference(overrides: Record<string, unknown> = {}) {
  return {
    status: "unset",
    consentVersion: null,
    decidedAt: null,
    nextPromptAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.reset();
  mocks.getServerSession.mockResolvedValue(session);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("authentication", () => {
  it("returns 401 for GET and PUT without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
    expect((await PUT(putRequest({ status: "granted", consentVersion: "1.0" }))).status).toBe(401);
    expect(mocks.inserts).toHaveLength(0);
  });
});

describe("GET /api/privacy/contribution-preference", () => {
  it("defaults to unset with null fields when the user has no row", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expectedPreference());
    expect(mocks.rows.size).toBe(0);
  });

  it("returns only the session owner's preference", async () => {
    mocks.rows.set("user-b", {
      userId: "user-b",
      status: "granted",
      consentVersion: "1.0",
      decidedAt: NOW,
      nextPromptAt: null,
      updatedAt: NOW,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expectedPreference());
  });
});

describe("PUT /api/privacy/contribution-preference", () => {
  it("persists granted and returns the stored shape", async () => {
    const response = await PUT(putRequest({ status: "granted", consentVersion: "1.0" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expectedPreference({
        status: "granted",
        consentVersion: "1.0",
        decidedAt: NOW.toISOString(),
      }),
    );
    expect(mocks.rows.get("user-a")).toEqual({
      userId: "user-a",
      status: "granted",
      consentVersion: "1.0",
      decidedAt: NOW,
      nextPromptAt: null,
      updatedAt: NOW,
    });

    const getResponse = await GET();
    expect(await getResponse.json()).toEqual(
      expectedPreference({
        status: "granted",
        consentVersion: "1.0",
        decidedAt: NOW.toISOString(),
      }),
    );
  });

  it.each(["declined", "withdrawn", "unset"] as const)(
    "persists %s and clears nextPromptAt",
    async (status) => {
      const response = await PUT(putRequest({ status, consentVersion: "1.0" }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expectedPreference({
          status,
          consentVersion: "1.0",
          decidedAt: NOW.toISOString(),
          nextPromptAt: null,
        }),
      );
      expect(mocks.rows.get("user-a")).toMatchObject({
        status,
        consentVersion: "1.0",
        nextPromptAt: null,
        decidedAt: NOW,
        updatedAt: NOW,
      });
    },
  );

  it("sets nextPromptAt to 30 days for ask_later and clears it on a later decision", async () => {
    const response = await PUT(putRequest({ status: "ask_later", consentVersion: "1.0" }));

    expect(response.status).toBe(200);
    const nextPromptAt = new Date(NOW.getTime() + THIRTY_DAYS_MS).toISOString();
    expect(await response.json()).toEqual(
      expectedPreference({
        status: "ask_later",
        consentVersion: "1.0",
        decidedAt: NOW.toISOString(),
        nextPromptAt,
      }),
    );
    expect(mocks.rows.get("user-a")).toMatchObject({
      status: "ask_later",
      nextPromptAt: new Date(NOW.getTime() + THIRTY_DAYS_MS),
    });

    const granted = await PUT(putRequest({ status: "granted", consentVersion: "1.0" }));

    expect(await granted.json()).toMatchObject({ status: "granted", nextPromptAt: null });
    expect(mocks.rows.get("user-a")).toMatchObject({ status: "granted", nextPromptAt: null });
  });

  it("upserts an existing row for the same user and refreshes timestamps", async () => {
    await PUT(putRequest({ status: "granted", consentVersion: "1.0" }));

    const later = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    vi.setSystemTime(later);
    const response = await PUT(putRequest({ status: "withdrawn", consentVersion: "1.1" }));

    expect(response.status).toBe(200);
    expect(mocks.rows.size).toBe(1);
    expect(mocks.inserts).toHaveLength(2);
    expect(mocks.rows.get("user-a")).toEqual({
      userId: "user-a",
      status: "withdrawn",
      consentVersion: "1.1",
      decidedAt: later,
      nextPromptAt: null,
      updatedAt: later,
    });
    expect(await response.json()).toEqual(
      expectedPreference({
        status: "withdrawn",
        consentVersion: "1.1",
        decidedAt: later.toISOString(),
      }),
    );
  });

  it.each([
    ["unknown status", { status: "accepted", consentVersion: "1.0" }],
    ["missing consentVersion", { status: "granted" }],
    ["missing consentVersion for unset", { status: "unset" }],
    ["empty consentVersion", { status: "granted", consentVersion: "" }],
    ["overlong consentVersion", { status: "granted", consentVersion: "v".repeat(33) }],
    ["extra fields", { status: "granted", consentVersion: "1.0", extra: true }],
    ["owner spoofing", { status: "granted", consentVersion: "1.0", userId: "user-b" }],
  ])("rejects %s with 400 without writing", async (_label, body) => {
    const response = await PUT(putRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_BODY" });
    expect(mocks.inserts).toHaveLength(0);
  });

  it("keeps preferences scoped to the session owner", async () => {
    mocks.getServerSession.mockResolvedValue(session);
    await PUT(putRequest({ status: "granted", consentVersion: "1.0" }));

    mocks.getServerSession.mockResolvedValue({ user: { id: "user-b" } });
    const foreignGet = await GET();
    expect(await foreignGet.json()).toEqual(expectedPreference());

    await PUT(putRequest({ status: "declined", consentVersion: "1.0" }));

    mocks.getServerSession.mockResolvedValue(session);
    const ownGet = await GET();

    expect(await ownGet.json()).toMatchObject({ status: "granted" });
    expect(mocks.rows.size).toBe(2);
    expect(mocks.inserts.map((insert) => insert.values.userId)).toEqual(["user-a", "user-b"]);
  });
});
