import { describe, expect, it } from "vitest";

import { buildTrustedOrigins } from "@/lib/auth-origins";

describe("buildTrustedOrigins", () => {
  it("keeps the web origin and adds a mobile origin", () => {
    expect(buildTrustedOrigins("http://localhost:3000", "association://")).toEqual([
      "http://localhost:3000",
      "association://",
    ]);
  });

  it("splits comma-separated mobile origins and trims whitespace", () => {
    expect(
      buildTrustedOrigins("https://app.example.com", " association:// , exp://192.168.1.10:8081 "),
    ).toEqual(["https://app.example.com", "association://", "exp://192.168.1.10:8081"]);
  });

  it("ignores empty entries", () => {
    expect(buildTrustedOrigins("https://app.example.com", " , , association:// , ")).toEqual([
      "https://app.example.com",
      "association://",
    ]);
  });

  it("deduplicates origins while preserving order", () => {
    expect(
      buildTrustedOrigins("https://app.example.com", "association://,https://app.example.com,association://"),
    ).toEqual(["https://app.example.com", "association://"]);
  });

  it("works without a mobile origin", () => {
    expect(buildTrustedOrigins("https://app.example.com")).toEqual(["https://app.example.com"]);
    expect(buildTrustedOrigins("https://app.example.com", undefined)).toEqual(["https://app.example.com"]);
  });
});
