import { createHash } from "node:crypto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ImageValidationError,
  MAX_IMAGE_EDGE,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  deleteLocalImage,
  getLocalImage,
  processImageBlob,
  putLocalImage,
  requestPersistentStorage,
  validateImageFile,
  type CanvasLike,
  type ImagePipelineDeps,
} from "./image-local-store";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_SIGNATURE = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const GIF_SIGNATURE = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML_BYTES = new TextEncoder().encode("<!doctype html><html></html>");
const OUTPUT_BYTES = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1]);

function imageFile(
  type: string,
  name = "photo.png",
  bytes: Uint8Array = PNG_SIGNATURE,
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

type FakePipelineOptions = {
  width: number;
  height: number;
  outputBytes?: Uint8Array;
  webpSupported?: boolean;
  bytesForCanvas?: (width: number, height: number) => Uint8Array;
};

function fakePipeline(options: FakePipelineOptions): {
  deps: Partial<ImagePipelineDeps>;
  draws: Array<{ width: number; height: number }>;
  close: ReturnType<typeof vi.fn>;
} {
  const draws: Array<{ width: number; height: number }> = [];
  const close = vi.fn();
  const outputBytes = options.outputBytes ?? OUTPUT_BYTES;

  return {
    deps: {
      createImageBitmap: async () => ({
        width: options.width,
        height: options.height,
        close,
      }),
      createCanvas: (width, height): CanvasLike => ({
        width,
        height,
        getContext: () => ({
          drawImage: () => {
            draws.push({ width, height });
          },
        }),
        convertToBlob: async ({ type }: { type?: string; quality?: number }) => {
          if (type === "image/webp" && options.webpSupported === false) {
            return new Blob([new Uint8Array([0])], { type: "image/png" });
          }

          const bytes = options.bytesForCanvas
            ? options.bytesForCanvas(width, height)
            : outputBytes;

          return new Blob([new Uint8Array(bytes)], { type });
        },
      }),
    },
    draws,
    close,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("validateImageFile", () => {
  it.each([
    ["image/jpeg", "image/jpeg"],
    ["image/jpg", "image/jpeg"],
    ["image/png", "image/png"],
    ["image/webp", "image/webp"],
  ])("принимает %s как %s", (type, expected) => {
    expect(validateImageFile({ name: "photo", type, size: 1024 })).toBe(
      expected,
    );
  });

  it.each([
    ["image/svg+xml", "vector.svg"],
    ["image/gif", "animation.gif"],
    ["text/html", "page.html"],
  ])("отклоняет %s", (type, name) => {
    expect(() =>
      validateImageFile({ name, type, size: 1024 }),
    ).toThrowError(
      expect.objectContaining({ code: "unsupported_type" }),
    );
  });

  it("принимает файл ровно 12 МБ и отклоняет файл больше 12 МБ", () => {
    expect(
      validateImageFile({ name: "max.png", type: "image/png", size: MAX_INPUT_BYTES }),
    ).toBe("image/png");

    expect(() =>
      validateImageFile({
        name: "too-big.png",
        type: "image/png",
        size: MAX_INPUT_BYTES + 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "file_too_large" }));
  });

  it("отклоняет пустой файл", () => {
    expect(() =>
      validateImageFile({ name: "empty.png", type: "image/png", size: 0 }),
    ).toThrowError(expect.objectContaining({ code: "invalid_image" }));
  });
});

describe("processImageBlob", () => {
  it("вписывает длинную сторону в 1600 и возвращает метаданные", async () => {
    const { deps, draws, close } = fakePipeline({ width: 3200, height: 1200 });

    const result = await processImageBlob(imageFile("image/png"), deps);

    expect(draws).toEqual([{ width: MAX_IMAGE_EDGE, height: 600 }]);
    expect(result).toMatchObject({
      mimeType: "image/webp",
      width: 1600,
      height: 600,
      byteSize: OUTPUT_BYTES.byteLength,
      checksum: sha256(OUTPUT_BYTES),
    });
    expect(result.blob.type).toBe("image/webp");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("не растягивает маленькое изображение", async () => {
    const { deps, draws } = fakePipeline({ width: 800, height: 600 });

    const result = await processImageBlob(
      imageFile("image/jpeg", "photo.jpg", JPEG_SIGNATURE),
      deps,
    );

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(draws).toEqual([{ width: 800, height: 600 }]);
  });

  it("отклоняет изображение больше 24 мегапикселей", async () => {
    const { deps } = fakePipeline({ width: 6000, height: 5000 });

    await expect(processImageBlob(imageFile("image/png"), deps)).rejects.toThrowError(
      expect.objectContaining({ code: "too_many_pixels" }),
    );
  });

  it("отклоняет SVG и GIF по MIME", async () => {
    const { deps } = fakePipeline({ width: 100, height: 100 });

    await expect(
      processImageBlob(imageFile("image/svg+xml", "vector.svg", SVG_BYTES), deps),
    ).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(
      processImageBlob(imageFile("image/gif", "animation.gif", GIF_SIGNATURE), deps),
    ).rejects.toMatchObject({ code: "unsupported_type" });
  });

  it("отклоняет SVG и HTML, замаскированные под PNG", async () => {
    const { deps } = fakePipeline({ width: 100, height: 100 });

    await expect(
      processImageBlob(imageFile("image/png", "photo.png", SVG_BYTES), deps),
    ).rejects.toMatchObject({ code: "invalid_image" });
    await expect(
      processImageBlob(imageFile("image/png", "photo.png", HTML_BYTES), deps),
    ).rejects.toMatchObject({ code: "invalid_image" });
    await expect(
      processImageBlob(imageFile("image/png", "photo.png", GIF_SIGNATURE), deps),
    ).rejects.toMatchObject({ code: "invalid_image" });
  });

  it("переключается на JPEG, если WebP не поддерживается", async () => {
    const { deps } = fakePipeline({
      width: 100,
      height: 100,
      webpSupported: false,
    });

    const result = await processImageBlob(imageFile("image/png"), deps);

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.blob.type).toBe("image/jpeg");
  });

  it("уменьшает изображение, пока результат не станет не больше 2 МБ", async () => {
    const { deps } = fakePipeline({
      width: 1600,
      height: 1200,
      bytesForCanvas: (width) =>
        width >= 1600
          ? new Uint8Array(MAX_OUTPUT_BYTES + 1)
          : OUTPUT_BYTES,
    });

    const result = await processImageBlob(imageFile("image/webp", "photo.webp", WEBP_SIGNATURE), deps);

    expect(result.width).toBeLessThan(1600);
    expect(result.byteSize).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
  });

  it("закрывает bitmap даже при ошибке выходного размера", async () => {
    const { deps, close } = fakePipeline({
      width: 1600,
      height: 1200,
      bytesForCanvas: () => new Uint8Array(MAX_OUTPUT_BYTES + 1),
    });

    await expect(
      processImageBlob(imageFile("image/png"), deps),
    ).rejects.toMatchObject({ code: "output_too_large" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("помечает ошибку декодирования как invalid_image", async () => {
    await expect(
      processImageBlob(imageFile("image/png"), {
        createImageBitmap: async () => {
          throw new Error("decode failed");
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_image" });
  });
});

describe("IndexedDB store", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("сохраняет Blob и возвращает метаданные, затем отдаёт Blob обратно", async () => {
    const mnemonicId = "mnemonic-1";
    const { deps } = fakePipeline({ width: 3200, height: 1200 });

    const media = await putLocalImage(
      mnemonicId,
      imageFile("image/png", "original-name.png"),
      deps,
    );

    expect(media).toEqual({
      mnemonicId,
      localUri: expect.stringContaining(mnemonicId),
      mimeType: "image/webp",
      width: 1600,
      height: 600,
      byteSize: OUTPUT_BYTES.byteLength,
      checksum: sha256(OUTPUT_BYTES),
      createdAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(media.createdAt))).toBe(false);

    const blob = await getLocalImage(mnemonicId);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("image/webp");
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(OUTPUT_BYTES);
  });

  it("перезапись по тому же ключу заменяет Blob", async () => {
    const mnemonicId = "mnemonic-2";

    await putLocalImage(
      mnemonicId,
      imageFile("image/png"),
      fakePipeline({ width: 100, height: 100 }).deps,
    );
    await putLocalImage(
      mnemonicId,
      imageFile("image/png"),
      fakePipeline({
        width: 100,
        height: 100,
        outputBytes: Uint8Array.from([1, 1, 1]),
      }).deps,
    );

    const blob = await getLocalImage(mnemonicId);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(
      Uint8Array.from([1, 1, 1]),
    );
  });

  it("удаляет Blob и возвращает null для отсутствующей записи", async () => {
    const mnemonicId = "mnemonic-3";

    await putLocalImage(
      mnemonicId,
      imageFile("image/png"),
      fakePipeline({ width: 100, height: 100 }).deps,
    );
    expect(await getLocalImage(mnemonicId)).not.toBeNull();

    await deleteLocalImage(mnemonicId);

    expect(await getLocalImage(mnemonicId)).toBeNull();
    await expect(deleteLocalImage(mnemonicId)).resolves.toBeUndefined();
    expect(await getLocalImage("missing")).toBeNull();
  });

  it("сохраняет Blob после имитации перезагрузки модуля", async () => {
    const mnemonicId = "mnemonic-4";

    await putLocalImage(
      mnemonicId,
      imageFile("image/png"),
      fakePipeline({ width: 100, height: 100 }).deps,
    );

    vi.resetModules();
    const reloaded = await import("./image-local-store");
    const blob = await reloaded.getLocalImage(mnemonicId);

    expect(blob).toBeInstanceOf(Blob);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(OUTPUT_BYTES);
  });

  it("не пишет Blob, если файл отклонён", async () => {
    const mnemonicId = "mnemonic-5";

    await expect(
      putLocalImage(
        mnemonicId,
        imageFile("image/svg+xml", "vector.svg", SVG_BYTES),
      ),
    ).rejects.toBeInstanceOf(ImageValidationError);
    expect(await getLocalImage(mnemonicId)).toBeNull();
  });

  it("отклоняет файл больше 12 МБ", async () => {
    const oversized = imageFile(
      "image/png",
      "big.png",
      new Uint8Array(MAX_INPUT_BYTES + 1),
    );

    await expect(putLocalImage("mnemonic-6", oversized)).rejects.toMatchObject({
      code: "file_too_large",
    });
  });
});

describe("requestPersistentStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("возвращает false, если Storage API недоступен", async () => {
    vi.stubGlobal("navigator", {});

    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it("вызывает navigator.storage.persist только по запросу", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist } });

    expect(persist).not.toHaveBeenCalled();
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("возвращает false при отказе браузера", async () => {
    vi.stubGlobal("navigator", {
      storage: { persist: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it("не вызывает persist при импорте модуля", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist } });

    vi.resetModules();
    await import("./image-local-store");

    expect(persist).not.toHaveBeenCalled();
  });
});
