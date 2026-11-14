/** Правила показа рекламы по страницам, согласию и подписке. */

import { describe, expect, it } from "vitest";

import { shouldLoadAds } from "./yandex-autoplacement";

const all = { version: "2026-11-14", categories: { advertising: true } };
const necessary = { version: "2026-11-14", categories: { advertising: false } };
const old = { version: "2026-11-01", categories: { advertising: true } };

describe("shouldLoadAds", () => {
  it("разрешает рекламу на информационных страницах после согласия", () => {
    expect(shouldLoadAds("/method", all, { vipActive: false, vipLoading: false })).toBe(true);
    expect(shouldLoadAds("/science", all, { vipActive: false, vipLoading: false })).toBe(true);
  });

  it("не загружает рекламу без согласия или со старой версией", () => {
    expect(shouldLoadAds("/method", necessary, { vipActive: false, vipLoading: false })).toBe(false);
    expect(shouldLoadAds("/method", null, { vipActive: false, vipLoading: false })).toBe(false);
    expect(shouldLoadAds("/method", old, { vipActive: false, vipLoading: false })).toBe(false);
  });

  it("не загружает рекламу для VIP и пока статус неизвестен", () => {
    expect(shouldLoadAds("/method", all, { vipActive: true, vipLoading: false })).toBe(false);
    expect(shouldLoadAds("/method", all, { vipActive: false, vipLoading: true })).toBe(false);
  });

  it("не загружает рекламу на лендинге, тарифах и в приложении", () => {
    for (const path of ["/", "/pricing", "/demo", "/register", "/dashboard", "/train", "/admin"]) {
      expect(shouldLoadAds(path, all, { vipActive: false, vipLoading: false })).toBe(false);
    }
  });
});
