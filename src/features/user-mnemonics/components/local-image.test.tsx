// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalImage } from "./local-image";

const mocks = vi.hoisted(() => ({
  getLocalImage: vi.fn(),
  createObjectURL: vi.fn(() => "blob:local-image"),
  revokeObjectURL: vi.fn(),
}));

vi.mock("@/features/user-mnemonics/image-local-store", () => ({
  getLocalImage: mocks.getLocalImage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocalImage.mockResolvedValue(
    new Blob(["image"], { type: "image/png" }),
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mocks.createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mocks.revokeObjectURL,
  });
});

afterEach(() => {
  cleanup();
});

describe("LocalImage", () => {
  it("renders an object URL and revokes it on unmount", async () => {
    const { unmount } = render(
      <LocalImage mnemonicId="usr-1" alt="Личная иллюстрация" />,
    );

    const image = await screen.findByAltText("Личная иллюстрация");
    expect(image.getAttribute("src")).toBe("blob:local-image");
    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:local-image");
  });

  it("revokes the old object URL when the mnemonic changes", async () => {
    const { rerender } = render(
      <LocalImage mnemonicId="usr-1" alt="Личная иллюстрация" />,
    );

    await screen.findByAltText("Личная иллюстрация");
    rerender(<LocalImage mnemonicId="usr-2" alt="Личная иллюстрация" />);

    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:local-image");
    expect(mocks.getLocalImage).toHaveBeenLastCalledWith("usr-2");
  });

  it("refetches and revokes the old URL when the refresh key changes", async () => {
    let loadCount = 0;
    let urlCount = 0;
    mocks.getLocalImage.mockImplementation(async () => {
      loadCount += 1;
      return new Blob([`image-${loadCount}`], { type: "image/png" });
    });
    mocks.createObjectURL.mockImplementation(() => {
      urlCount += 1;
      return `blob:${urlCount}`;
    });

    const { rerender } = render(
      <LocalImage mnemonicId="usr-1" alt="Личная иллюстрация" refreshKey={0} />,
    );

    expect(
      (await screen.findByAltText("Личная иллюстрация")).getAttribute("src"),
    ).toBe("blob:1");

    rerender(
      <LocalImage mnemonicId="usr-1" alt="Личная иллюстрация" refreshKey={1} />,
    );

    await waitFor(() =>
      expect(
        screen.getByAltText("Личная иллюстрация").getAttribute("src"),
      ).toBe("blob:2"),
    );
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("shows the cross-device placeholder when the blob is missing", async () => {
    mocks.getLocalImage.mockResolvedValue(null);

    render(<LocalImage mnemonicId="usr-1" alt="Личная иллюстрация" />);

    expect(
      await screen.findByText(
        "Изображение хранится только на исходном устройстве или не добавлено",
      ),
    ).toBeTruthy();
  });

  it("offers an action to add the image on this device", async () => {
    mocks.getLocalImage.mockResolvedValue(null);
    const onAddImage = vi.fn();

    render(
      <LocalImage
        mnemonicId="usr-1"
        alt="Личная иллюстрация"
        onAddImage={onAddImage}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Добавить картинку на этом устройстве",
      }),
    );

    expect(onAddImage).toHaveBeenCalledTimes(1);
  });
});
