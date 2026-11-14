/** Версия и актуальность cookie-согласия. */

import { describe, expect, it } from "vitest";

import { COOKIE_CONSENT_VERSION, isCurrentConsent } from "./cookie-consent";

describe("cookie consent version", () => {
  it("имеет фиксированную версию политики", () => {
    expect(COOKIE_CONSENT_VERSION).toBe("2026-11-14");
  });

  it("считает актуальным только текущую версию", () => {
    expect(isCurrentConsent({ version: "2026-11-14" })).toBe(true);
    expect(isCurrentConsent({ version: "2026-11-01" })).toBe(false);
  });
});
