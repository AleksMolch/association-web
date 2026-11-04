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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireVip", () => {
  it("returns true when hasVip reports an active subscription", async () => {
    mocks.hasVip.mockResolvedValue(true);

    await expect(requireVip("user-1")).resolves.toBe(true);
    expect(mocks.hasVip).toHaveBeenCalledWith("user-1");
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
  });

  it("returns false when hasVip reports no active subscription", async () => {
    mocks.hasVip.mockResolvedValue(false);

    await expect(requireVip("user-1")).resolves.toBe(false);
    expect(mocks.hasVip).toHaveBeenCalledWith("user-1");
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
  });

  it("returns false for an empty userId without querying the database", async () => {
    await expect(requireVip("")).resolves.toBe(false);
    expect(mocks.hasVip).not.toHaveBeenCalled();
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
  });

  it("returns false for a whitespace-only userId without querying the database", async () => {
    await expect(requireVip("   ")).resolves.toBe(false);
    expect(mocks.hasVip).not.toHaveBeenCalled();
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
  });
});
