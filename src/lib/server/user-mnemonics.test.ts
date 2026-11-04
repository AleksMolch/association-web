import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => {
  const reads: { table: unknown; where: unknown }[] = [];
  const updates: { table: unknown; set: Record<string, unknown>; where: unknown }[] = [];
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  let selectRows: unknown[] = [];
  let updateRows: unknown[] = [];

  const db = {
    select() {
      return {
        from(table: unknown) {
          return {
            where(where: unknown) {
              reads.push({ table, where });
              return Promise.resolve(selectRows);
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          inserts.push({ table, values });
          return Promise.resolve();
        },
      };
    },
    update(table: unknown) {
      return {
        set(set: Record<string, unknown>) {
          const update = { table, set, where: undefined as unknown };
          return {
            where(where: unknown) {
              update.where = where;
              updates.push(update);
              return {
                returning() {
                  return Promise.resolve(updateRows);
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    reads,
    updates,
    inserts,
    db,
    setSelectRows(rows: unknown[]) {
      selectRows = rows;
    },
    setUpdateRows(rows: unknown[]) {
      updateRows = rows;
    },
    reset() {
      reads.length = 0;
      updates.length = 0;
      inserts.length = 0;
      selectRows = [];
      updateRows = [];
    },
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  createUserMnemonic,
  deleteUserMnemonic,
  listUserMnemonics,
  updateUserMnemonic,
} from "@/lib/server/user-mnemonics";

const dialect = new PgDialect();

function toQuery(value: unknown) {
  return dialect.sqlToQuery(value as SQL);
}

function normalizedSql(value: unknown): string {
  return toQuery(value)
    .sql.replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim();
}

function tableName(table: unknown): string {
  return getTableName(table as Parameters<typeof getTableName>[0]);
}

function row(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-11-04T00:00:00.000Z");
  return {
    id: "user-a:mnemonic-1",
    userId: "user-a",
    wordId: 1,
    meaningId: "1",
    cueWord: "Брат",
    sceneText: "брат освещает лицо сестры ярким фонарём",
    locale: "ru",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rev: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.reset();
});

describe("listUserMnemonics", () => {
  it("scopes active reads to the owner and an optional wordId", async () => {
    mocks.setSelectRows([row()]);

    const result = await listUserMnemonics("user-a", 1);

    expect(result).toEqual([
      {
        id: "user-a:mnemonic-1",
        wordId: 1,
        meaningId: "1",
        cueWord: "Брат",
        sceneText: "брат освещает лицо сестры ярким фонарём",
        locale: "ru",
        createdAt: "2026-11-04T00:00:00.000Z",
        updatedAt: "2026-11-04T00:00:00.000Z",
        deletedAt: null,
        rev: 1,
      },
    ]);

    const [read] = mocks.reads;
    expect(read).toBeDefined();
    if (!read) throw new Error("missing read");
    expect(tableName(read.table)).toBe("user_mnemonics");
    expect(normalizedSql(read.where)).toContain("user_mnemonics.user_id =");
    expect(normalizedSql(read.where)).toContain("user_mnemonics.deleted_at is null");
    expect(normalizedSql(read.where)).toContain("user_mnemonics.word_id =");
    expect(toQuery(read.where).params).toEqual(["user-a", 1]);
  });

  it("does not add a word filter when wordId is omitted", async () => {
    mocks.setSelectRows([]);

    await listUserMnemonics("user-a");

    const [read] = mocks.reads;
    expect(read).toBeDefined();
    if (!read) throw new Error("missing read");
    expect(normalizedSql(read.where)).not.toContain("word_id");
    expect(toQuery(read.where).params).toEqual(["user-a"]);
  });
});

describe("createUserMnemonic", () => {
  it("inserts a server-owned text record with rev 1 and locale ru", async () => {
    const created = await createUserMnemonic("user-a", {
      wordId: 1,
      meaningId: "1",
      cueWord: "Брат",
      sceneText: "брат освещает лицо сестры ярким фонарём",
    });

    const [write] = mocks.inserts;
    expect(write).toBeDefined();
    if (!write) throw new Error("missing insert");
    expect(tableName(write.table)).toBe("user_mnemonics");
    expect(write.values).toMatchObject({
      userId: "user-a",
      wordId: 1,
      meaningId: "1",
      cueWord: "Брат",
      sceneText: "брат освещает лицо сестры ярким фонарём",
      locale: "ru",
      deletedAt: null,
      rev: 1,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(Object.keys(write.values).sort()).toEqual([
      "createdAt",
      "cueWord",
      "deletedAt",
      "id",
      "locale",
      "meaningId",
      "rev",
      "sceneText",
      "updatedAt",
      "userId",
      "wordId",
    ]);
    expect(String(write.values.id)).toMatch(/^user-a:[0-9a-f-]{36}$/);
    expect(created.id).toBe(write.values.id);
    expect(created).toMatchObject({
      wordId: 1,
      meaningId: "1",
      cueWord: "Брат",
      locale: "ru",
      deletedAt: null,
      rev: 1,
    });
    expect(created).not.toHaveProperty("userId");
  });
});

describe("updateUserMnemonic", () => {
  it("updates an active owned row, increments rev, and touches updatedAt", async () => {
    const updatedAt = new Date("2026-11-05T00:00:00.000Z");
    mocks.setUpdateRows([
      row({
        cueWord: "Новый ключ",
        sceneText: "новая сцена с ярким фонарём",
        updatedAt,
        rev: 2,
      }),
    ]);

    const result = await updateUserMnemonic("user-a", "user-a:mnemonic-1", {
      cueWord: "Новый ключ",
      sceneText: "новая сцена с ярким фонарём",
    });

    expect(result).toMatchObject({
      id: "user-a:mnemonic-1",
      cueWord: "Новый ключ",
      sceneText: "новая сцена с ярким фонарём",
      rev: 2,
    });

    const [write] = mocks.updates;
    expect(write).toBeDefined();
    if (!write) throw new Error("missing update");
    expect(tableName(write.table)).toBe("user_mnemonics");
    expect(write.set).toMatchObject({
      cueWord: "Новый ключ",
      sceneText: "новая сцена с ярким фонарём",
      updatedAt: expect.any(Date),
    });
    expect(normalizedSql(write.set.rev)).toBe("user_mnemonics.rev + 1");
    expect(normalizedSql(write.where)).toContain("user_mnemonics.id =");
    expect(normalizedSql(write.where)).toContain("user_mnemonics.user_id =");
    expect(normalizedSql(write.where)).toContain("user_mnemonics.deleted_at is null");
    expect(toQuery(write.where).params).toEqual(["user-a:mnemonic-1", "user-a"]);
  });

  it("returns null when no active row belongs to the owner", async () => {
    mocks.setUpdateRows([]);

    const result = await updateUserMnemonic("user-a", "user-b:mnemonic-1", { cueWord: "Чужой" });

    expect(result).toBeNull();
    expect(mocks.updates).toHaveLength(1);
  });
});

describe("deleteUserMnemonic", () => {
  it("writes a tombstone with rev++ for an active owned row", async () => {
    const deletedAt = new Date("2026-11-05T00:00:00.000Z");
    mocks.setUpdateRows([
      row({
        deletedAt,
        updatedAt: deletedAt,
        rev: 2,
      }),
    ]);

    const result = await deleteUserMnemonic("user-a", "user-a:mnemonic-1");

    expect(result).toMatchObject({
      id: "user-a:mnemonic-1",
      deletedAt: "2026-11-05T00:00:00.000Z",
      updatedAt: "2026-11-05T00:00:00.000Z",
      rev: 2,
    });

    const [write] = mocks.updates;
    expect(write).toBeDefined();
    if (!write) throw new Error("missing update");
    expect(write.set).toMatchObject({
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(normalizedSql(write.set.rev)).toBe("user_mnemonics.rev + 1");
    expect(normalizedSql(write.where)).toContain("user_mnemonics.id =");
    expect(normalizedSql(write.where)).toContain("user_mnemonics.user_id =");
    expect(normalizedSql(write.where)).toContain("user_mnemonics.deleted_at is null");
    expect(toQuery(write.where).params).toEqual(["user-a:mnemonic-1", "user-a"]);
    expect(mocks.reads).toHaveLength(0);
  });

  it("returns null for a missing or foreign id", async () => {
    mocks.setUpdateRows([]);
    mocks.setSelectRows([]);

    const result = await deleteUserMnemonic("user-a", "user-b:mnemonic-1");

    expect(result).toBeNull();
    const [read] = mocks.reads;
    expect(read).toBeDefined();
    if (!read) throw new Error("missing fallback read");
    expect(normalizedSql(read.where)).toContain("user_mnemonics.id =");
    expect(normalizedSql(read.where)).toContain("user_mnemonics.user_id =");
    expect(toQuery(read.where).params).toEqual(["user-b:mnemonic-1", "user-a"]);
  });

  it("is idempotent for an owned tombstone", async () => {
    const deletedAt = new Date("2026-11-05T00:00:00.000Z");
    mocks.setUpdateRows([]);
    mocks.setSelectRows([
      row({
        deletedAt,
        updatedAt: deletedAt,
        rev: 2,
      }),
    ]);

    const result = await deleteUserMnemonic("user-a", "user-a:mnemonic-1");

    expect(result).toMatchObject({
      id: "user-a:mnemonic-1",
      deletedAt: "2026-11-05T00:00:00.000Z",
      rev: 2,
    });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.reads).toHaveLength(1);
  });

  it("does not return an active row from the idempotency fallback", async () => {
    mocks.setUpdateRows([]);
    mocks.setSelectRows([row({ deletedAt: null })]);

    const result = await deleteUserMnemonic("user-a", "user-a:mnemonic-1");

    expect(result).toBeNull();
  });
});
