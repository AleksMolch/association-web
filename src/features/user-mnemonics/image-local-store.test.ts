import { createHash } from "node:crypto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IMAGE_DATABASE_NAME,
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
const GIF_SIGNATURE = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML_BYTES = new TextEncoder().encode("<!doctype html><html></html>");
const OUTPUT_BYTES = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1]);

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set(PNG_SIGNATURE, 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  writeUint32BE(bytes, 16, width);
  writeUint32BE(bytes, 20, height);
  bytes.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return bytes;
}

function jpegHeader(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function webpVp8xHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  writeUint32LE(bytes, 4, bytes.length - 8);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  writeUint32LE(bytes, 16, 10);
  writeUint24LE(bytes, 24, width - 1);
  writeUint24LE(bytes, 27, height - 1);
  return bytes;
}

function webpVp8lHeader(width: number, height: number): Uint8Array {
  const widthBits = width - 1;
  const heightBits = height - 1;
  const bytes = new Uint8Array(25);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  writeUint32LE(bytes, 4, bytes.length - 8);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12);
  writeUint32LE(bytes, 16, 5);
  bytes[20] = 0x2f;
  bytes[21] = widthBits & 0xff;
  bytes[22] = ((widthBits >>> 8) & 0x3f) | ((heightBits & 0x03) << 6);
  bytes[23] = (heightBits >>> 2) & 0xff;
  bytes[24] = (heightBits >>> 10) & 0x0f;
  return bytes;
}

function webpVp8Header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  writeUint32LE(bytes, 4, bytes.length - 8);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x20], 12);
  writeUint32LE(bytes, 16, 10);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  bytes[26] = width & 0xff;
  bytes[27] = (width >>> 8) & 0x3f;
  bytes[28] = height & 0xff;
  bytes[29] = (height >>> 8) & 0x3f;
  return bytes;
}

function writeUint24LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function headerFor(type: string, width: number, height: number): Uint8Array {
  const normalized = type === "image/jpg" ? "image/jpeg" : type;

  if (normalized === "image/jpeg") {
    return jpegHeader(width, height);
  }

  if (normalized === "image/webp") {
    return webpVp8xHeader(width, height);
  }

  return pngHeader(width, height);
}

function imageFile(
  type: string,
  name = "photo.png",
  bytes: Uint8Array = PNG_SIGNATURE,
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function imageFileWithDimensions(
  type: string,
  width: number,
  height: number,
  name?: string,
): File {
  const fileName =
    name ??
    (type === "image/webp"
      ? "photo.webp"
      : type === "image/jpeg"
        ? "photo.jpg"
        : "photo.png");

  return imageFile(type, fileName, headerFor(type, width, height));
}

type FakePipelineOptions = {
  width: number;
  height: number;
  type?: string;
  name?: string;
  outputBytes?: Uint8Array;
  webpSupported?: boolean;
  bytesForCanvas?: (width: number, height: number) => Uint8Array;
};

function fakePipeline(options: FakePipelineOptions): {
  deps: Partial<ImagePipelineDeps>;
  draws: Array<{ width: number; height: number }>;
  close: ReturnType<typeof vi.fn>;
  decode: ReturnType<typeof vi.fn>;
  file: File;
} {
  const draws: Array<{ width: number; height: number }> = [];
  const close = vi.fn();
  const outputBytes = options.outputBytes ?? OUTPUT_BYTES;
  const type = options.type ?? "image/png";
  const decode = vi.fn(async () => ({
    width: options.width,
    height: options.height,
    close,
  }));

  return {
    deps: {
      createImageBitmap: decode,
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
    decode,
    file: imageFileWithDimensions(
      type,
      options.width,
      options.height,
      options.name,
    ),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function openRawDatabase(
  factory: IDBFactory,
  version: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(IMAGE_DATABASE_NAME, version);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteRawDatabase(factory: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(IMAGE_DATABASE_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
    const { deps, draws, close, file } = fakePipeline({
      width: 3200,
      height: 1200,
    });

    const result = await processImageBlob(file, deps);

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
    const { deps, draws, file } = fakePipeline({
      width: 800,
      height: 600,
      type: "image/jpeg",
      name: "photo.jpg",
    });

    const result = await processImageBlob(file, deps);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(draws).toEqual([{ width: 800, height: 600 }]);
  });

  it.each(["image/png", "image/jpeg", "image/webp"])(
    "читает размеры %s из заголовка",
    async (type) => {
      const { deps, file } = fakePipeline({
        width: 1234,
        height: 567,
        type,
      });

      const result = await processImageBlob(file, deps);

      expect(result).toMatchObject({ width: 1234, height: 567 });
    },
  );

  it.each(["image/png", "image/jpeg", "image/webp"])(
    "отклоняет >24 МП %s по заголовку до декодирования",
    async (type) => {
      const { deps, decode } = fakePipeline({
        width: 100,
        height: 100,
        type,
      });

      await expect(
        processImageBlob(
          imageFileWithDimensions(type, 6000, 5000),
          deps,
        ),
      ).rejects.toMatchObject({ code: "too_many_pixels" });
      expect(decode).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["VP8L", webpVp8lHeader],
    ["VP8", webpVp8Header],
  ])(
    "отклоняет >24 МП WebP %s по заголовку до декодирования",
    async (_variant, buildHeader) => {
      const { deps, decode } = fakePipeline({ width: 100, height: 100 });

      await expect(
        processImageBlob(
          imageFile("image/webp", "photo.webp", buildHeader(6000, 5000)),
          deps,
        ),
      ).rejects.toMatchObject({ code: "too_many_pixels" });
      expect(decode).not.toHaveBeenCalled();
    },
  );

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
    const { deps, file } = fakePipeline({
      width: 100,
      height: 100,
      webpSupported: false,
    });

    const result = await processImageBlob(file, deps);

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.blob.type).toBe("image/jpeg");
  });

  it("уменьшает изображение, пока результат не станет не больше 2 МБ", async () => {
    const { deps, file } = fakePipeline({
      width: 1600,
      height: 1200,
      type: "image/webp",
      bytesForCanvas: (width) =>
        width >= 1600
          ? new Uint8Array(MAX_OUTPUT_BYTES + 1)
          : OUTPUT_BYTES,
    });

    const result = await processImageBlob(file, deps);

    expect(result.width).toBeLessThan(1600);
    expect(result.byteSize).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
  });

  it("закрывает bitmap даже при ошибке выходного размера", async () => {
    const { deps, close, file } = fakePipeline({
      width: 1600,
      height: 1200,
      bytesForCanvas: () => new Uint8Array(MAX_OUTPUT_BYTES + 1),
    });

    await expect(processImageBlob(file, deps)).rejects.toMatchObject({
      code: "output_too_large",
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("помечает ошибку декодирования как invalid_image", async () => {
    const { file } = fakePipeline({ width: 100, height: 100 });

    await expect(
      processImageBlob(file, {
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
    const { deps, file } = fakePipeline({
      width: 3200,
      height: 1200,
      name: "original-name.png",
    });

    const media = await putLocalImage(mnemonicId, file, deps);

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
    const first = fakePipeline({ width: 100, height: 100 });
    const second = fakePipeline({
      width: 100,
      height: 100,
      outputBytes: Uint8Array.from([1, 1, 1]),
    });

    await putLocalImage(mnemonicId, first.file, first.deps);
    await putLocalImage(mnemonicId, second.file, second.deps);

    const blob = await getLocalImage(mnemonicId);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(
      Uint8Array.from([1, 1, 1]),
    );
  });

  it("удаляет Blob и возвращает null для отсутствующей записи", async () => {
    const mnemonicId = "mnemonic-3";
    const { deps, file } = fakePipeline({ width: 100, height: 100 });

    await putLocalImage(mnemonicId, file, deps);
    expect(await getLocalImage(mnemonicId)).not.toBeNull();

    await deleteLocalImage(mnemonicId);

    expect(await getLocalImage(mnemonicId)).toBeNull();
    await expect(deleteLocalImage(mnemonicId)).resolves.toBeUndefined();
    expect(await getLocalImage("missing")).toBeNull();
  });

  it("сохраняет Blob после имитации перезагрузки модуля", async () => {
    const mnemonicId = "mnemonic-4";
    const { deps, file } = fakePipeline({ width: 100, height: 100 });

    await putLocalImage(mnemonicId, file, deps);

    vi.resetModules();
    const reloaded = await import("./image-local-store");
    const blob = await reloaded.getLocalImage(mnemonicId);

    expect(blob).toBeInstanceOf(Blob);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(OUTPUT_BYTES);
  });

  it("сбрасывает соединение после versionchange из другой вкладки", async () => {
    const mnemonicId = "mnemonic-versionchange";
    const { deps, file } = fakePipeline({ width: 100, height: 100 });

    await putLocalImage(mnemonicId, file, deps);

    const upgraded = await openRawDatabase(globalThis.indexedDB, 2);
    upgraded.close();

    const blob = await getLocalImage(mnemonicId);

    expect(blob).toBeInstanceOf(Blob);
  });

  it("переоткрывает БД после удаления из другой вкладки", async () => {
    const mnemonicId = "mnemonic-deleted";
    const { deps, file } = fakePipeline({ width: 100, height: 100 });

    await putLocalImage(mnemonicId, file, deps);
    await deleteRawDatabase(globalThis.indexedDB);

    await expect(getLocalImage(mnemonicId)).resolves.toBeNull();

    const restored = fakePipeline({ width: 100, height: 100 });
    await expect(
      putLocalImage(mnemonicId, restored.file, restored.deps),
    ).resolves.toMatchObject({ mnemonicId });
  });

  it("отклоняет открытие, если IndexedDB заблокирован", async () => {
    const request = {
      result: undefined,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest;
    const factory = {
      open: vi.fn(() => {
        queueMicrotask(() => {
          request.onblocked?.(
            new Event("blocked") as unknown as IDBVersionChangeEvent,
          );
        });

        return request;
      }),
    } as unknown as IDBFactory;

    vi.stubGlobal("indexedDB", factory);

    await expect(getLocalImage("blocked")).rejects.toThrow(
      "Хранилище изображений заблокировано другой вкладкой",
    );
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
