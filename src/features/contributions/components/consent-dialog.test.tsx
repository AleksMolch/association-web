// @vitest-environment jsdom

/**
 * consent-dialog.test.tsx — диалог добровольного участия.
 *
 * Проверяет точные тексты §9.2, действия «Да», «Не сейчас», «Подробнее» с
 * отказом навсегда и закрытие по Escape как отложенное решение.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_COPY,
  type ConsentAction,
} from "@/features/contributions/consent";

import { ConsentDialog } from "./consent-dialog";

afterEach(() => {
  cleanup();
});

function renderDialog(open = true) {
  const onAction = vi.fn<(action: ConsentAction) => void>();
  render(<ConsentDialog open={open} onAction={onAction} />);
  return onAction;
}

describe("ConsentDialog", () => {
  it("не рендерится закрытым", () => {
    renderDialog(false);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("показывает точные тексты §9.2", () => {
    renderDialog();

    expect(
      screen.getByRole("heading", { name: CONSENT_COPY.title }),
    ).toBeTruthy();
    expect(screen.getByText(CONSENT_COPY.body)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: CONSENT_COPY.grantButton }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: CONSENT_COPY.declineButton }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: CONSENT_COPY.detailLink }),
    ).toBeTruthy();
  });

  it("передаёт согласие по кнопке «Да, делиться текстом»", () => {
    const onAction = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.grantButton }),
    );

    expect(onAction).toHaveBeenCalledWith("grant");
  });

  it("откладывает вопрос по «Не сейчас» и по крестику", () => {
    const onAction = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.declineButton }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Отложить вопрос" }),
    );

    expect(onAction).toHaveBeenNthCalledWith(1, "ask_later");
    expect(onAction).toHaveBeenNthCalledWith(2, "ask_later");
  });

  it("раскрывает подробности и позволяет отказаться навсегда", () => {
    const onAction = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.detailLink }),
    );

    expect(screen.getByText(CONSENT_COPY.detailTitle)).toBeTruthy();
    expect(screen.getByText(CONSENT_COPY.detailBody)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: CONSENT_COPY.detailDeclineButton }),
    );

    expect(onAction).toHaveBeenCalledWith("decline");
  });

  it("закрывается по Escape как отложенное решение", () => {
    const onAction = renderDialog();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onAction).toHaveBeenCalledWith("ask_later");
  });
});
