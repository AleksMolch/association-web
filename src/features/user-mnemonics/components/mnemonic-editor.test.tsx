// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { words } from "@/content";
import type { LocalMnemonicMedia, UserMnemonic } from "@/features/user-mnemonics/types";

import { MnemonicEditor } from "./mnemonic-editor";

const mocks = vi.hoisted(() => ({
  putLocalImage: vi.fn(),
  deleteLocalImage: vi.fn(),
  getLocalImage: vi.fn(),
  requestPersistentStorage: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/features/user-mnemonics/image-local-store", () => ({
  putLocalImage: mocks.putLocalImage,
  deleteLocalImage: mocks.deleteLocalImage,
  getLocalImage: mocks.getLocalImage,
  requestPersistentStorage: mocks.requestPersistentStorage,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const word = words[0];
const existingMnemonic: UserMnemonic = {
  id: "usr-existing",
  wordId: word.id,
  meaningId: "0",
  cueWord: "Старое созвучие",
  sceneText: "Старая сцена с братом",
  locale: "ru",
  createdAt: "2026-11-04T09:00:00.000Z",
  updatedAt: "2026-11-04T09:00:00.000Z",
  deletedAt: null,
  rev: 1,
};

const media: LocalMnemonicMedia = {
  mnemonicId: existingMnemonic.id,
  localUri: `indexeddb://association-user-images/images/${existingMnemonic.id}`,
  mimeType: "image/webp",
  width: 800,
  height: 600,
  byteSize: 1024,
  checksum: "abc",
  createdAt: "2026-11-04T09:05:00.000Z",
};

function renderEditor(overrides: Partial<Parameters<typeof MnemonicEditor>[0]> = {}) {
  const props: Parameters<typeof MnemonicEditor>[0] = {
    wordId: word.id,
    meaningId: "0",
    createUserMnemonic: vi.fn(() => ({ ...existingMnemonic, id: "usr-new" })),
    updateUserMnemonic: vi.fn(() => existingMnemonic),
    setLocalMediaMeta: vi.fn(),
    deleteLocalMediaMeta: vi.fn(),
    onCancel: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  };

  render(<MnemonicEditor {...props} />);
  return props;
}

function fillValidText() {
  fireEvent.change(screen.getByLabelText("Созвучие"), {
    target: { value: "Брат" },
  });
  fireEvent.change(screen.getByLabelText("Сцена"), {
    target: { value: "Брат похож на брата" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocalImage.mockResolvedValue(null);
  mocks.putLocalImage.mockResolvedValue(media);
  mocks.deleteLocalImage.mockResolvedValue(undefined);
  mocks.requestPersistentStorage.mockResolvedValue(true);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe("MnemonicEditor", () => {
  it("blocks invalid input without calling create", () => {
    const props = renderEditor();

    fireEvent.change(screen.getByLabelText("Созвучие"), {
      target: { value: "x".repeat(81) },
    });
    fireEvent.change(screen.getByLabelText("Сцена"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(props.createUserMnemonic).not.toHaveBeenCalled();
    expect(props.updateUserMnemonic).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(2);
  });

  it("creates a new variant with trimmed text", async () => {
    const props = renderEditor();

    fireEvent.change(screen.getByLabelText("Созвучие"), {
      target: { value: "  Брат  " },
    });
    fireEvent.change(screen.getByLabelText("Сцена"), {
      target: { value: "  Брат похож на брата  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(props.createUserMnemonic).toHaveBeenCalledTimes(1),
    );
    expect(props.createUserMnemonic).toHaveBeenCalledWith({
      wordId: word.id,
      meaningId: "0",
      cueWord: "Брат",
      sceneText: "Брат похож на брата",
    });
    expect(props.updateUserMnemonic).not.toHaveBeenCalled();
    expect(props.onSaved).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("updates an existing variant", async () => {
    const props = renderEditor({ mnemonic: existingMnemonic });

    fireEvent.change(screen.getByLabelText("Созвучие"), {
      target: { value: "Новое созвучие" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(props.updateUserMnemonic).toHaveBeenCalledWith(
        existingMnemonic.id,
        {
          cueWord: "Новое созвучие",
          sceneText: "Старая сцена с братом",
        },
      ),
    );
    expect(props.createUserMnemonic).not.toHaveBeenCalled();
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("stores a selected image after saving and requests persistence only after the action", async () => {
    const props = renderEditor();
    const file = new File(["image"], "scene.png", { type: "image/png" });

    expect(mocks.requestPersistentStorage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Изображение (необязательно)"), {
      target: { files: [file] },
    });

    expect(mocks.requestPersistentStorage).toHaveBeenCalledTimes(1);

    fillValidText();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(mocks.putLocalImage).toHaveBeenCalledWith("usr-new", file),
    );
    expect(props.setLocalMediaMeta).toHaveBeenCalledWith(media);
  });

  it("replaces an existing image under the same mnemonic id", async () => {
    mocks.getLocalImage.mockResolvedValue(
      new Blob(["old"], { type: "image/png" }),
    );
    const props = renderEditor({ mnemonic: existingMnemonic });
    const file = new File(["new"], "new-scene.png", { type: "image/png" });

    await screen.findByRole("button", { name: "Удалить фото" });
    fireEvent.change(screen.getByLabelText("Изображение (необязательно)"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(mocks.putLocalImage).toHaveBeenCalledWith(
        existingMnemonic.id,
        file,
      ),
    );
    expect(props.setLocalMediaMeta).toHaveBeenCalledWith(media);
  });

  it("deletes the local image and its metadata when the image is removed", async () => {
    mocks.getLocalImage.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    const props = renderEditor({ mnemonic: existingMnemonic });

    fireEvent.click(
      await screen.findByRole("button", { name: "Удалить фото" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(props.updateUserMnemonic).toHaveBeenCalledTimes(1),
    );
    expect(mocks.deleteLocalImage).toHaveBeenCalledWith(existingMnemonic.id);
    expect(props.deleteLocalMediaMeta).toHaveBeenCalledWith(existingMnemonic.id);
    expect(mocks.putLocalImage).not.toHaveBeenCalled();
  });

  it("cancels without writing", () => {
    const props = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.createUserMnemonic).not.toHaveBeenCalled();
    expect(mocks.putLocalImage).not.toHaveBeenCalled();
  });
});
