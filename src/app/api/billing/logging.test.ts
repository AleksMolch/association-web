import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  createSubscriptionPayment: vi.fn(),
  applyProviderPaymentStatus: vi.fn(),
  getBillingOverview: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/billing/service", () => ({
  createSubscriptionPayment: mocks.createSubscriptionPayment,
  applyProviderPaymentStatus: mocks.applyProviderPaymentStatus,
  getBillingOverview: mocks.getBillingOverview,
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

import { POST as createPaymentPOST } from "./create-payment/route";
import { GET as statusGET } from "./status/route";
import { POST as webhookPOST } from "./webhook/route";

const session = {
  user: { id: "user-a", email: "user@example.com" },
};

const marker = `billing-payload-${crypto.randomUUID()}`;

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .flat()
    .map((value: unknown) => String(value))
    .join(" ");
}

function expectOnlyStringArguments(
  spy: ReturnType<typeof vi.spyOn>,
): void {
  const args = spy.mock.calls.flat();
  expect(args.length).toBeGreaterThan(0);
  expect(args.every((value: unknown) => typeof value === "string")).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue(session);
  mocks.createSubscriptionPayment.mockResolvedValue({
    paymentId: "payment-1",
    confirmationUrl: "https://yoomoney.ru/checkout",
  });
  mocks.getBillingOverview.mockResolvedValue({
    subscription: null,
    payments: [],
  });
  mocks.applyProviderPaymentStatus.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("billing route logging", () => {
  it("logs only a static tag when create-payment fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createSubscriptionPayment.mockRejectedValueOnce(
      new Error(`provider rejected ${marker} user@example.com`),
    );

    const response = await createPaymentPOST(
      postRequest("/api/billing/create-payment", { planCode: "1m" }),
    );

    expect(response.status).toBe(502);
    expectOnlyStringArguments(errorSpy);
    const logged = loggedText(errorSpy);
    expect(logged).toContain("[billing:create-payment]");
    expect(logged).not.toContain(marker);
    expect(logged).not.toContain("user@example.com");
  });

  it("logs only a static tag when the webhook fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.applyProviderPaymentStatus.mockRejectedValueOnce(
      new Error(`webhook payload ${marker} user@example.com`),
    );

    const response = await webhookPOST(
      postRequest("/api/billing/webhook", {
        event: "payment.succeeded",
        object: { id: "payment-1", status: "succeeded" },
      }),
    );

    expect(response.status).toBe(500);
    expectOnlyStringArguments(errorSpy);
    const logged = loggedText(errorSpy);
    expect(logged).toContain("[billing:webhook]");
    expect(logged).not.toContain(marker);
    expect(logged).not.toContain("user@example.com");
  });

  it("logs only a static tag when billing status fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getBillingOverview.mockRejectedValueOnce(
      new Error(`status payload ${marker} user@example.com`),
    );

    const response = await statusGET(
      new Request("http://localhost/api/billing/status"),
    );

    expect(response.status).toBe(503);
    expectOnlyStringArguments(errorSpy);
    const logged = loggedText(errorSpy);
    expect(logged).toContain("[billing:status]");
    expect(logged).not.toContain(marker);
    expect(logged).not.toContain("user@example.com");
  });
});
