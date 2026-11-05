import { describe, expect, it } from "vitest";

import { maskEmail, redactEmails } from "@/lib/redact";

describe("redactEmails", () => {
  it("masks every email-like substring", () => {
    expect(
      redactEmails("invalid recipient user@example.com; retry later"),
    ).toBe("invalid recipient u***@example.com; retry later");
  });

  it("leaves text without emails unchanged", () => {
    expect(redactEmails("provider returned status 400")).toBe(
      "provider returned status 400",
    );
  });

  it("fully redacts values without a valid-looking email", () => {
    expect(maskEmail("not-an-email")).toBe("[redacted]");
  });
});
