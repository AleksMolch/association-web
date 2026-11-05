import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserMnemonic } from "@/features/user-mnemonics/types";

type StoredMnemonic = UserMnemonic & { userId: string };

type CreateInput = {
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
};

type UpdateInput = {
  cueWord?: string;
  sceneText?: string;
};

function withoutOwner(mnemonic: StoredMnemonic): UserMnemonic {
  return {
    id: mnemonic.id,
    wordId: mnemonic.wordId,
    meaningId: mnemonic.meaningId,
    cueWord: mnemonic.cueWord,
    sceneText: mnemonic.sceneText,
    locale: mnemonic.locale,
    createdAt: mnemonic.createdAt,
    updatedAt: mnemonic.updatedAt,
    deletedAt: mnemonic.deletedAt,
    rev: mnemonic.rev,
  };
}

const mocks = vi.hoisted(() => {
  const rows = new Map<string, StoredMnemonic>();
  const getServerSession = vi.fn();
  const listUserMnemonics = vi.fn();
  const createUserMnemonic = vi.fn();
  const updateUserMnemonic = vi.fn();
  const deleteUserMnemonic = vi.fn();

  createUserMnemonic.mockImplementation(async (userId: string, input: CreateInput) => {
    const now = new Date().toISOString();
    const row: StoredMnemonic = {
      id: `${userId}:${crypto.randomUUID()}`,
      userId,
      wordId: input.wordId,
      meaningId: input.meaningId,
      cueWord: input.cueWord,
      sceneText: input.sceneText,
      locale: "ru",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      rev: 1,
    };
    rows.set(row.id, row);
    return withoutOwner(row);
  });

  listUserMnemonics.mockImplementation(async (userId: string, wordId?: number) => {
    return [...rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          (wordId === undefined || row.wordId === wordId),
      )
      .map(withoutOwner);
  });

  updateUserMnemonic.mockImplementation(
    async (userId: string, id: string, patch: UpdateInput) => {
      const row = rows.get(id);
      if (!row || row.userId !== userId || row.deletedAt !== null) return null;

      const updated: StoredMnemonic = {
        ...row,
        ...(patch.cueWord !== undefined ? { cueWord: patch.cueWord } : {}),
        ...(patch.sceneText !== undefined ? { sceneText: patch.sceneText } : {}),
        updatedAt: new Date().toISOString(),
        rev: row.rev + 1,
      };
      rows.set(id, updated);
      return withoutOwner(updated);
    },
  );

  deleteUserMnemonic.mockImplementation(async (userId: string, id: string) => {
    const row = rows.get(id);
    if (!row || row.userId !== userId) return null;
    if (row.deletedAt !== null) return withoutOwner(row);

    const deletedAt = new Date().toISOString();
    const tombstone: StoredMnemonic = {
      ...row,
      deletedAt,
      updatedAt: deletedAt,
      rev: row.rev + 1,
    };
    rows.set(id, tombstone);
    return withoutOwner(tombstone);
  });

  return {
    rows,
    getServerSession,
    listUserMnemonics,
    createUserMnemonic,
    updateUserMnemonic,
    deleteUserMnemonic,
    reset() {
      vi.clearAllMocks();
      rows.clear();
    },
  };
});

vi.mock("@/lib/server/session", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/server/user-mnemonics", () => ({
  listUserMnemonics: mocks.listUserMnemonics,
  createUserMnemonic: mocks.createUserMnemonic,
  updateUserMnemonic: mocks.updateUserMnemonic,
  deleteUserMnemonic: mocks.deleteUserMnemonic,
}));

import { DELETE, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

const session = { user: { id: "user-a" } };

const validBody = {
  wordId: 1,
  meaningId: "1",
  cueWord: "Брат",
  sceneText: "брат освещает лицо сестры ярким фонарём",
};

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/user-mnemonics", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function getRequest(query = "") {
  return new Request(`http://localhost/api/user-mnemonics${query}`);
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mocks.reset();
  mocks.getServerSession.mockResolvedValue(session);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authentication", () => {
  it("returns 401 for every handler without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    expect((await GET(getRequest())).status).toBe(401);
    expect((await POST(request("POST", validBody))).status).toBe(401);
    expect(
      (await PATCH(request("PATCH", { cueWord: "Ключ" }), idContext("user-a:any"))).status,
    ).toBe(401);
    expect((await DELETE(request("DELETE"), idContext("user-a:any"))).status).toBe(401);

    expect(mocks.listUserMnemonics).not.toHaveBeenCalled();
    expect(mocks.createUserMnemonic).not.toHaveBeenCalled();
    expect(mocks.updateUserMnemonic).not.toHaveBeenCalled();
    expect(mocks.deleteUserMnemonic).not.toHaveBeenCalled();
  });
});

describe("GET /api/user-mnemonics", () => {
  it("returns only active mnemonics for the session user and filters by wordId", async () => {
    const first = await mocks.createUserMnemonic("user-a", validBody);
    const second = await mocks.createUserMnemonic("user-a", { ...validBody, wordId: 2 });
    const foreign = await mocks.createUserMnemonic("user-b", validBody);

    const response = await GET(getRequest("?wordId=1"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as UserMnemonic[];
    expect(body.map((row) => row.id)).toEqual([first.id]);
    expect(body.map((row) => row.id)).not.toContain(second.id);
    expect(body.map((row) => row.id)).not.toContain(foreign.id);
    expect(mocks.listUserMnemonics).toHaveBeenCalledWith("user-a", 1);
  });

  it("returns all active mnemonics when wordId is omitted", async () => {
    const first = await mocks.createUserMnemonic("user-a", validBody);
    const second = await mocks.createUserMnemonic("user-a", { ...validBody, wordId: 2 });

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as UserMnemonic[];
    expect(body.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
    expect(mocks.listUserMnemonics).toHaveBeenCalledWith("user-a", undefined);
  });

  it("rejects a non-numeric wordId query with 400", async () => {
    const response = await GET(getRequest("?wordId=abc"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_QUERY" });
    expect(mocks.listUserMnemonics).not.toHaveBeenCalled();
  });

  it("rejects an unknown wordId filter with 400", async () => {
    const response = await GET(getRequest("?wordId=999999"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_WORD" });
    expect(mocks.listUserMnemonics).not.toHaveBeenCalled();
  });
});

describe("POST /api/user-mnemonics", () => {
  it("creates a server-owned record with rev 1 and locale ru", async () => {
    const response = await POST(request("POST", validBody));

    expect(response.status).toBe(201);
    const created = (await response.json()) as UserMnemonic;
    expect(created).toMatchObject({
      wordId: 1,
      meaningId: "1",
      cueWord: "Брат",
      sceneText: "брат освещает лицо сестры ярким фонарём",
      locale: "ru",
      deletedAt: null,
      rev: 1,
    });
    expect(created.id).toMatch(/^user-a:[0-9a-f-]{36}$/);
    expect(mocks.createUserMnemonic).toHaveBeenCalledWith("user-a", validBody);
  });

  it("rejects an unknown word with 400", async () => {
    const response = await POST(request("POST", { ...validBody, wordId: 999999 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_WORD" });
    expect(mocks.createUserMnemonic).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload with 400", async () => {
    const invalidPayloads = [
      { ...validBody, wordId: undefined },
      { ...validBody, wordId: 0 },
      { ...validBody, cueWord: "" },
      { ...validBody, cueWord: "x".repeat(81) },
      { ...validBody, sceneText: "кор" },
      { ...validBody, meaningId: "" },
      { ...validBody, userId: "user-b" },
    ];

    for (const payload of invalidPayloads) {
      const response = await POST(request("POST", payload));
      expect(response.status).toBe(400);
    }
    expect(mocks.createUserMnemonic).not.toHaveBeenCalled();
  });

  it("rejects media and uri fields because the body schema is strict", async () => {
    const forbidden = {
      image: "w1_1_bright.webp",
      localUri: "file:///secret.jpg",
      fileName: "secret.jpg",
      base64: "AAAA",
      media: { uri: "file:///secret.jpg" },
    };

    for (const [field, value] of Object.entries(forbidden)) {
      const response = await POST(request("POST", { ...validBody, [field]: value }));
      expect(response.status).toBe(400);
    }
    expect(mocks.createUserMnemonic).not.toHaveBeenCalled();
  });

  it("does not log cue or scene text when persistence fails", async () => {
    const marker = `уникальная-сцена-${crypto.randomUUID()}`;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createUserMnemonic.mockRejectedValueOnce(
      new Error(`insert failed for ${marker}`),
    );

    const response = await POST(
      request("POST", { ...validBody, sceneText: marker }),
    );

    expect(response.status).toBe(503);
    const logged = errorSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(" ");
    expect(logged).not.toContain(marker);
  });
});

describe("PATCH/DELETE /api/user-mnemonics/[id]", () => {
  it("updates and tombstones an owned mnemonic, excluding it from later GETs", async () => {
    const created = (await (await POST(request("POST", validBody))).json()) as UserMnemonic;

    const patchResponse = await PATCH(
      request("PATCH", {
        cueWord: "  Новый ключ  ",
        sceneText: "  новая сцена с ярким фонарём  ",
      }),
      idContext(created.id),
    );

    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as UserMnemonic;
    expect(patched).toMatchObject({
      id: created.id,
      cueWord: "Новый ключ",
      sceneText: "новая сцена с ярким фонарём",
      deletedAt: null,
      rev: 2,
    });
    expect(mocks.updateUserMnemonic).toHaveBeenCalledWith("user-a", created.id, {
      cueWord: "Новый ключ",
      sceneText: "новая сцена с ярким фонарём",
    });

    const deleteResponse = await DELETE(request("DELETE"), idContext(created.id));

    expect(deleteResponse.status).toBe(200);
    const tombstone = (await deleteResponse.json()) as UserMnemonic;
    expect(tombstone.id).toBe(created.id);
    expect(tombstone.deletedAt).toEqual(expect.any(String));
    expect(tombstone.rev).toBe(3);

    const after = await GET(getRequest("?wordId=1"));
    const remaining = (await after.json()) as UserMnemonic[];
    expect(remaining.map((row) => row.id)).not.toContain(created.id);

    const repeatedDelete = await DELETE(request("DELETE"), idContext(created.id));
    expect(repeatedDelete.status).toBe(200);
    expect((await repeatedDelete.json()) as UserMnemonic).toEqual(tombstone);
  });

  it("returns 404 for another user's id without changing the row", async () => {
    const foreign = await mocks.createUserMnemonic("user-b", validBody);

    const patchResponse = await PATCH(
      request("PATCH", { cueWord: "Чужой" }),
      idContext(foreign.id),
    );
    const deleteResponse = await DELETE(request("DELETE"), idContext(foreign.id));

    expect(patchResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    expect(mocks.rows.get(foreign.id)).toMatchObject({
      userId: "user-b",
      cueWord: "Брат",
      deletedAt: null,
      rev: 1,
    });
  });

  it("returns 404 for a tombstoned id on PATCH", async () => {
    const created = await mocks.createUserMnemonic("user-a", validBody);
    await mocks.deleteUserMnemonic("user-a", created.id);

    const response = await PATCH(
      request("PATCH", { cueWord: "После удаления" }),
      idContext(created.id),
    );

    expect(response.status).toBe(404);
  });

  it("rejects invalid or empty patch payloads with 400", async () => {
    const created = await mocks.createUserMnemonic("user-a", validBody);
    const invalidPayloads = [
      {},
      { cueWord: "" },
      { cueWord: "x".repeat(81) },
      { sceneText: "кор" },
      { meaningId: "2" },
      { wordId: 2 },
    ];

    for (const payload of invalidPayloads) {
      const response = await PATCH(request("PATCH", payload), idContext(created.id));
      expect(response.status).toBe(400);
    }
    expect(mocks.updateUserMnemonic).not.toHaveBeenCalled();
  });

  it("rejects media and uri fields on PATCH because the body schema is strict", async () => {
    const created = await mocks.createUserMnemonic("user-a", validBody);

    const response = await PATCH(
      request("PATCH", { cueWord: "Ключ", localUri: "file:///secret.jpg" }),
      idContext(created.id),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateUserMnemonic).not.toHaveBeenCalled();
  });
});
