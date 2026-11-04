import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveSubscription: vi.fn(),
  hasVip: vi.fn(),
}));

vi.mock("@/lib/billing/service", () => ({
  getActiveSubscription: mocks.getActiveSubscription,
  hasVip: mocks.hasVip,
}));

import { requireVip } from "@/lib/server/entitlement";

const activeSubscription = {
  id: "subscription-1",
  userId: "user-1",
  planId: "vip-monthly",
  status: "active",
  startsAt: new Date("2026-11-01T00:00:00.000Z"),
  endsAt: new Date("2026-12-01T00:00:00.000Z"),
  paymentId: "payment-1",
  updatedAt: new Date("2026-11-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasVip.mockImplementation(async (userId: string) => {
    const subscription = await mocks.getActiveSubscription(userId);
    return subscription !== null;
  });
});

describe("requireVip", () => {
  it("returns true for an active, unexpired subscription", async () => {
    mocks.getActiveSubscription.mockResolvedValue(activeSubscription);

    await expect(requireVip("user-1")).resolves.toBe(true);
    expect(mocks.hasVip).toHaveBeenCalledWith("user-1");
    expect(mocks.getActiveSubscription).toHaveBeenCalledWith("user-1");
  });

  it("returns false when no subscription exists", async () => {
    mocks.getActiveSubscription.mockResolvedValue(null);

    await expect(requireVip("user-1")).resolves.toBe(false);
  });

  it("returns false for an expired subscription", async () => {
    mocks.getActiveSubscription.mockResolvedValue(null);

    await expect(requireVip("user-1")).resolves.toBe(false);
    expect(mocks.getActiveSubscription).toHaveBeenCalledWith("user-1");
  });

  it("returns false for a canceled subscription", async () => {
    mocks.getActiveSubscription.mockResolvedValue(null);

    await expect(requireVip("user-1")).resolves.toBe(false);
    expect(mocks.getActiveSubscription).toHaveBeenCalledWith("user-1");
  });

  it("returns false for an empty userId without querying the database", async () => {
    await expect(requireVip("")).resolves.toBe(false);
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
    expect(mocks.hasVip).not.toHaveBeenCalled();
  });

  it("returns false for a whitespace-only userId without querying the database", async () => {
    await expect(requireVip("   ")).resolves.toBe(false);
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
    expect(mocks.hasVip).not.toHaveBeenCalled();
  });
});
