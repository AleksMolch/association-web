import { describe, expect, it } from "vitest";

import type { UserMnemonic } from "@/features/user-mnemonics/types";
import { assessGuestOwner, hasLocalPersonalData } from "@/lib/guest-owner";
import { defaultSettings } from "@/lib/types";

function mnemonic(overrides: Partial<UserMnemonic> = {}): UserMnemonic {
  return {
    id: "usr-1",
    wordId: 1,
    meaningId: "0",
    cueWord: "Брат",
    sceneText: "Брат светит фонарём",
    locale: "ru",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    deletedAt: null,
    rev: 1,
    ...overrides,
  };
}

function snapshot(
  overrides: {
    consent?: typeof defaultSettings.contributionConsent;
    consentVersion?: string | null;
    mnemonics?: Record<string, UserMnemonic>;
  } = {},
) {
  return {
    settings: {
      contributionConsent: overrides.consent ?? defaultSettings.contributionConsent,
      contributionConsentVersion:
        overrides.consentVersion ?? defaultSettings.contributionConsentVersion,
    },
    userMnemonics: overrides.mnemonics ?? {},
  };
}

describe("assessGuestOwner", () => {
  it("claims local data when no owner marker exists", () => {
    expect(assessGuestOwner(null, "user-a", snapshot())).toBe("claim");
  });

  it("accepts the same account", () => {
    expect(assessGuestOwner("user-a", "user-a", snapshot())).toBe("ok");
  });

  it("rejects another account when local personal text exists", () => {
    expect(
      assessGuestOwner("user-a", "user-b", snapshot({ mnemonics: { "usr-1": mnemonic() } })),
    ).toBe("mismatch");
  });

  it("rejects another account when only a consent decision exists", () => {
    expect(
      assessGuestOwner(
        "user-a",
        "user-b",
        snapshot({ consent: "granted", consentVersion: "1.0" }),
      ),
    ).toBe("mismatch");
  });

  it("claims a different account when no personal data or consent remains", () => {
    expect(assessGuestOwner("user-a", "user-b", snapshot())).toBe("claim");
  });
});

describe("hasLocalPersonalData", () => {
  it("counts tombstones as local personal text", () => {
    expect(
      hasLocalPersonalData(
        snapshot({
          mnemonics: {
            "usr-1": mnemonic({ deletedAt: "2026-11-02T00:00:00.000Z" }),
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns false for default settings and no mnemonics", () => {
    expect(hasLocalPersonalData(snapshot())).toBe(false);
  });
});
