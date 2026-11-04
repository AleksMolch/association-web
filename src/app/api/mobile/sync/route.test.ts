import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireVip: vi.fn(),
  loadProgress: vi.fn(),
  applyProgress: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/server/entitlement", () => ({ requireVip: mocks.requireVip }));
vi.mock("@/lib/server/progress", () => ({
  loadProgress: mocks.loadProgress,
  applyProgress: mocks.applyProgress,
}));

import { mobileSyncBodySchema } from "@/lib/api/schemas";
import { GET, POST } from "./route";

const session = { user: { id: "user-a" } };

const state = {
  cards: [],
  reviews: [],
  selections: [],
  settings: {
    dailyGoal: 10 as const,
    hintsEnabled: true,
    reducedMotion: false,
    ttsRate: 0.95,
    updatedAt: "2026-11-04T00:00:00.000Z",
  },
  userMnemonics: [],
};

const validBody = {
  cards: [],
  reviews: [],
  selections: [],
  settings: {
    dailyGoal: 10,
    hintsEnabled: true,
    reducedMotion: false,
    ttsRate: 0.95,
    updatedAt: "2026-11-04T00:00:00.000Z",
  },
  userMnemonics: [],
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/mobile/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadProgress.mockResolvedValue(state);
  mocks.applyProgress.mockResolvedValue(undefined);
});

describe("GET /api/mobile/sync", () => {
  it("returns 401 without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.requireVip).not.toHaveBeenCalled();
    expect(mocks.loadProgress).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-VIP user", async () => {
    mocks.getServerSession.mockResolvedValue(session);
    mocks.requireVip.mockResolvedValue(false);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "VIP_REQUIRED" });
    expect(mocks.requireVip).toHaveBeenCalledWith("user-a");
    expect(mocks.loadProgress).not.toHaveBeenCalled();
  });

  it("returns 200 for a VIP user and scopes the load to the session owner", async () => {
    mocks.getServerSession.mockResolvedValue(session);
    mocks.requireVip.mockResolvedValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(state);
    expect(mocks.loadProgress).toHaveBeenCalledTimes(1);
    expect(mocks.loadProgress).toHaveBeenCalledWith("user-a");
  });
});

describe("POST /api/mobile/sync", () => {
  it("returns 401 without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(401);
    expect(mocks.requireVip).not.toHaveBeenCalled();
    expect(mocks.applyProgress).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-VIP user", async () => {
    mocks.getServerSession.mockResolvedValue(session);
    mocks.requireVip.mockResolvedValue(false);

    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(403);
    expect(mocks.applyProgress).not.toHaveBeenCalled();
  });

  it("applies a VIP payload for the session owner and returns merged state", async () => {
    mocks.getServerSession.mockResolvedValue(session);
    mocks.requireVip.mockResolvedValue(true);

    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(200);
    expect(mocks.applyProgress).toHaveBeenCalledTimes(1);
    expect(mocks.applyProgress).toHaveBeenCalledWith("user-a", validBody);
    expect(mocks.loadProgress).toHaveBeenCalledWith("user-a");
    expect(await response.json()).toEqual(state);
  });

  it("rejects an invalid body with 400 without applying it", async () => {
    mocks.getServerSession.mockResolvedValue(session);
    mocks.requireVip.mockResolvedValue(true);

    const response = await POST(postRequest({ cards: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_BODY" });
    expect(mocks.applyProgress).not.toHaveBeenCalled();
  });

  it("rejects owner spoofing fields because the body schema is strict", async () => {
    mocks.getServerSession.mockResolvedValue(session);
    mocks.requireVip.mockResolvedValue(true);

    const response = await POST(postRequest({ ...validBody, userId: "user-b" }));

    expect(response.status).toBe(400);
    expect(mocks.applyProgress).not.toHaveBeenCalled();
  });

  it("rejects user mnemonic media or uri fields", async () => {
    const mediaMnemonic = {
      id: "mnemonic-1",
      wordId: 1,
      meaningId: "1",
      cueWord: "cue",
      sceneText: "scene text",
      locale: "ru",
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
      deletedAt: null,
      rev: 1,
      localUri: "file:///secret.jpg",
    };
    mocks.getServerSession.mockResolvedValue(session);
    mocks.requireVip.mockResolvedValue(true);

    const response = await POST(postRequest({ ...validBody, userMnemonics: [mediaMnemonic] }));

    expect(response.status).toBe(400);
    expect(mocks.applyProgress).not.toHaveBeenCalled();
    expect(mobileSyncBodySchema.safeParse({ ...validBody, userMnemonics: [mediaMnemonic] }).success).toBe(
      false,
    );
  });
});
