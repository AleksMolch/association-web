// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { DecisionControls } from "./decision-controls";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("DecisionControls", () => {
  it("shows all normal moderation actions for a non-withdrawn row", () => {
    render(<DecisionControls contributionId="contribution-1" status="pending" />);

    expect(screen.getByRole("button", { name: "Одобрить" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "На доработку" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Дубликат" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отозвать" })).toBeTruthy();
  });

  it("only exposes repeated withdraw for a withdrawn row", () => {
    render(<DecisionControls contributionId="contribution-1" status="withdrawn" />);

    expect(screen.getByRole("button", { name: "Отозвать" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Одобрить" })).toBeNull();
    expect(screen.queryByRole("button", { name: "На доработку" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Отклонить" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Дубликат" })).toBeNull();
    expect(
      screen.getByText("Вклад отозван. Доступен только повторный отзыв."),
    ).toBeTruthy();
  });

  it("posts a decision and refreshes the queue", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DecisionControls contributionId="contribution-1" status="pending" />);

    fireEvent.click(screen.getByRole("button", { name: "Одобрить" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/mnemonic-contributions/contribution-1/decision",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "approve" }),
      }),
    );
  });
});
