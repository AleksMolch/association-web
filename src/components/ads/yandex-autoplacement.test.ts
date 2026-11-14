/** Правила показа рекламы по страницам и согласию. */

import { describe, expect, it } from "vitest";

import { shouldLoadAds } from "./yandex-autoplacement";

describe("shouldLoadAds", () => {
  it("разрешает рекламу на информационных страницах после согласия", () => {
    expect(shouldLoadAds("/method", "all")).toBe(true);
    expect(shouldLoadAds("/science", "all")).toBe(true);
  });

  it("не загружает рекламу без согласия", () => {
    expect(shouldLoadAds("/method", "necessary")).toBe(false);
    expect(shouldLoadAds("/method", null)).toBe(false);
    expect(shouldLoadAds("/method", undefined)).toBe(false);
  });

  it("не загружает рекламу на лендинге, тарифах и в приложении", () => {
    for (const path of ["/", "/pricing", "/demo", "/register", "/dashboard", "/train", "/admin"]) {
      expect(shouldLoadAds(path, "all")).toBe(false);
    }
  });
});
