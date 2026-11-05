import { afterEach, describe, expect, it, vi } from "vitest";

import {
  duplicateScore,
  mergeModerationReason,
  MODERATION_QUEUE_DEFAULT_LIMIT,
  MODERATION_QUEUE_MAX_LIMIT,
  normalizeQueuePagination,
  parseModerationFlags,
  pseudonymousContributorId,
} from "./moderation";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseModerationFlags", () => {
  it("parses flags from a stored reason and ignores human text", () => {
    expect(parseModerationFlags("sensitive_content:email,phone")).toEqual({
      email: true,
      phone: true,
      url: false,
    });
    expect(
      parseModerationFlags("sensitive_content:email,url; Слишком коротко"),
    ).toEqual({
      email: true,
      phone: false,
      url: true,
    });
  });

  it("returns all-false flags for a plain reason", () => {
    expect(parseModerationFlags("Не по теме")).toEqual({
      email: false,
      phone: false,
      url: false,
    });
    expect(parseModerationFlags(null)).toEqual({
      email: false,
      phone: false,
      url: false,
    });
  });
});

describe("mergeModerationReason", () => {
  it("keeps the sensitive prefix when a new reason is added", () => {
    expect(
      mergeModerationReason(
        "sensitive_content:email,phone",
        "Слишком коротко",
      ),
    ).toBe("sensitive_content:email,phone; Слишком коротко");
  });

  it("preserves flags when a decision has no new human reason", () => {
    expect(
      mergeModerationReason("sensitive_content:url; старый текст", null),
    ).toBe("sensitive_content:url");
  });

  it("merges flags from previous and next reasons without duplicates", () => {
    expect(
      mergeModerationReason(
        "sensitive_content:email",
        "sensitive_content:phone; правка",
      ),
    ).toBe("sensitive_content:email,phone; правка");
  });

  it("leaves plain reasons unchanged", () => {
    expect(mergeModerationReason(null, "Не по теме")).toBe("Не по теме");
    expect(mergeModerationReason(null, null)).toBeNull();
  });
});

describe("duplicateScore", () => {
  it("is binary for exact normalized-hash duplicates", () => {
    expect(duplicateScore(0)).toBe(0);
    expect(duplicateScore(1)).toBe(1);
    expect(duplicateScore(5)).toBe(1);
  });
});

describe("normalizeQueuePagination", () => {
  it("applies defaults and caps the limit", () => {
    expect(normalizeQueuePagination()).toEqual({
      limit: MODERATION_QUEUE_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(normalizeQueuePagination(MODERATION_QUEUE_MAX_LIMIT + 500, -5)).toEqual({
      limit: MODERATION_QUEUE_MAX_LIMIT,
      offset: 0,
    });
    expect(normalizeQueuePagination(0, 12.9)).toEqual({ limit: 1, offset: 12 });
  });
});

describe("pseudonymousContributorId", () => {
  it("is stable, hides the raw userId and respects the secret", () => {
    vi.stubEnv("MODERATION_PSEUDONYM_SECRET", "first-secret");
    const first = pseudonymousContributorId("user-a");
    const repeat = pseudonymousContributorId("user-a");
    const other = pseudonymousContributorId("user-b");

    expect(first).toMatch(/^contributor_[0-9a-f]{64}$/);
    expect(first).toBe(repeat);
    expect(first).not.toBe(other);
    expect(first).not.toContain("user-a");

    vi.stubEnv("MODERATION_PSEUDONYM_SECRET", "second-secret");
    expect(pseudonymousContributorId("user-a")).not.toBe(first);
  });

  it("returns null for anonymous contributions", () => {
    expect(pseudonymousContributorId(null)).toBeNull();
    expect(pseudonymousContributorId(undefined)).toBeNull();
  });
});
