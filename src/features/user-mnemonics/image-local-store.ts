import type { LocalMnemonicMedia } from "./types";

export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 24_000_000;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_DATABASE_NAME = "association-user-images";
export const IMAGE_OBJECT_STORE = "images";

const DATABASE_VERSION = 1;
const WEBP_QUALITIES = [0.85, 0.7, 0.55, 0.4] as const;
const JPEG_QUALITIES = [0.86, 0.72, 0.58, 0.44] as const;
const DOWNSCALE_STEPS = 4;
const DOWNSCALE_FACTOR = 0.72;

export type SupportedImageMime = LocalMnemonicMedia["mimeType"];

export type ImageValidationErrorCode =
  | "unsupported_type"
  | "file_too_large"
  | "invalid_image"
  | "too_many_pixels"
  | "output_too_large";

export class ImageValidationError extends Error {
  readonly code: ImageValidationErrorCode;

  constructor(code: ImageValidationErrorCode, message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

export type ImageFileLike = {
  name?: string;
  type: string;
  size: number;
};

export type ImageBitmapLike = {
  readonly width: number;
  readonly height: number;
  close?: () => void;
};

export type CanvasRenderingContextLike = {
  drawImage(
    image: ImageBitmapLike,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  drawImage(
    image: ImageBitmapLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
};

export type CanvasLike = {
  width: number;
  height: number;
  getContext(contextId: "2d"): CanvasRenderingContextLike | null;
  toBlob?(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void;
  convertToBlob?(options?: {
    type?: string;
    quality?: number;
  }): Promise<Blob>;
};

export type ImagePipelineDeps = {
  createImageBitmap: (blob: Blob) => Promise<ImageBitmapLike>;
  createCanvas: (width: number, height: number) => CanvasLike;
  digest: (bytes: Uint8Array) => Promise<string>;
};

export type ProcessedImage = {
  blob: Blob;
  mimeType: SupportedImageMime;
  width: number;
  height: number;
  byteSize: number;
  checksum: string;
};

const ALLOWED_MIME_TYPES: Readonly<Record<string, SupportedImageMime>> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
};

let cachedFactory: IDBFactory | null = null;
let cachedDatabase: Promise<IDBDatabase> | null = null;

export function validateImageFile(file: ImageFileLike): SupportedImageMime {
  const mimeType = ALLOWED_MIME_TYPES[file.type.trim().toLowerCase()];

  if (!mimeType) {
    throw new ImageValidationError(
      "unsupported_type",
      "Поддерживаются только JPEG, PNG и WebP",
    );
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new ImageValidationError("invalid_image", "Файл изображения пустой");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageValidationError(
      "file_too_large",
      "Изображение больше 12 МБ",
    );
  }

  return mimeType;
}

export function localImageUri(mnemonicId: string): string {
  return `indexeddb://${IMAGE_DATABASE_NAME}/${IMAGE_OBJECT_STORE}/${encodeURIComponent(mnemonicId)}`;
}

export async function processImageBlob(
  file: Blob,
  overrides: Partial<ImagePipelineDeps> = {},
): Promise<ProcessedImage> {
  validateImageFile(file);
  await assertImageSignature(file);

  const deps = resolvePipelineDeps(overrides);
  const bitmap = await decodeImage(file, deps);

  try {
    const sourceWidth = Math.floor(bitmap.width);
    const sourceHeight = Math.floor(bitmap.height);

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new ImageValidationError(
        "invalid_image",
        "Не удалось определить размеры изображения",
      );
    }

    if (sourceWidth * sourceHeight > MAX_INPUT_PIXELS) {
      throw new ImageValidationError(
        "too_many_pixels",
        "Изображение больше 24 мегапикселей",
      );
    }

    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight),
    );
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const encoded = await encodeWithinLimit(
      bitmap,
      targetWidth,
      targetHeight,
      deps,
    );
    const bytes = new Uint8Array(await encoded.blob.arrayBuffer());

    return {
      blob: encoded.blob,
      mimeType: encoded.mimeType,
      width: encoded.width,
      height: encoded.height,
      byteSize: bytes.byteLength,
      checksum: await deps.digest(bytes),
    };
  } finally {
    bitmap.close?.();
  }
}

export async function putLocalImage(
  mnemonicId: string,
  file: File,
  overrides: Partial<ImagePipelineDeps> = {},
): Promise<LocalMnemonicMedia> {
  const id = requireMnemonicId(mnemonicId);
  const processed = await processImageBlob(file, overrides);

  await writeBlob(id, processed.blob);

  return {
    mnemonicId: id,
    localUri: localImageUri(id),
    mimeType: processed.mimeType,
    width: processed.width,
    height: processed.height,
    byteSize: processed.byteSize,
    checksum: processed.checksum,
    createdAt: new Date().toISOString(),
  };
}

export async function getLocalImage(mnemonicId: string): Promise<Blob | null> {
  const id = requireMnemonicId(mnemonicId);
  const db = await getDatabase();
  const transaction = db.transaction(IMAGE_OBJECT_STORE, "readonly");
  const transactionDone = transactionAsPromise(transaction);
  const result = await requestAsPromise(
    transaction.objectStore(IMAGE_OBJECT_STORE).get(id),
  );

  await transactionDone;

  return result instanceof Blob ? result : null;
}

export async function deleteLocalImage(mnemonicId: string): Promise<void> {
  const id = requireMnemonicId(mnemonicId);
  const db = await getDatabase();
  const transaction = db.transaction(IMAGE_OBJECT_STORE, "readwrite");
  const transactionDone = transactionAsPromise(transaction);

  transaction.objectStore(IMAGE_OBJECT_STORE).delete(id);

  await transactionDone;
}

export async function requestPersistentStorage(): Promise<boolean> {
  const storage =
    typeof navigator === "undefined" ? undefined : navigator.storage;

  if (!storage || typeof storage.persist !== "function") {
    return false;
  }

  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

function requireMnemonicId(mnemonicId: string): string {
  if (typeof mnemonicId !== "string" || mnemonicId.trim().length === 0) {
    throw new TypeError("mnemonicId обязателен");
  }

  return mnemonicId;
}

async function assertImageSignature(file: Blob): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg =
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff;
  const isPng =
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a;
  const isWebp =
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50;

  if (!isJpeg && !isPng && !isWebp) {
    throw new ImageValidationError(
      "invalid_image",
      "Содержимое файла не является JPEG, PNG или WebP",
    );
  }
}

function resolvePipelineDeps(
  overrides: Partial<ImagePipelineDeps>,
): ImagePipelineDeps {
  return {
    createImageBitmap:
      overrides.createImageBitmap ?? defaultCreateImageBitmap,
    createCanvas: overrides.createCanvas ?? createBrowserCanvas,
    digest: overrides.digest ?? digestBytes,
  };
}

function defaultCreateImageBitmap(blob: Blob): Promise<ImageBitmapLike> {
  if (typeof globalThis.createImageBitmap !== "function") {
    throw new Error("createImageBitmap недоступен в этом окружении");
  }

  return globalThis.createImageBitmap(blob);
}

async function decodeImage(
  file: Blob,
  deps: ImagePipelineDeps,
): Promise<ImageBitmapLike> {
  try {
    return await deps.createImageBitmap(file);
  } catch {
    throw new ImageValidationError(
      "invalid_image",
      "Не удалось декодировать изображение",
    );
  }
}

function createBrowserCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as CanvasLike;
  }

  if (typeof document === "undefined") {
    throw new Error("Canvas API недоступен в этом окружении");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  return canvas as unknown as CanvasLike;
}

type EncodedImage = {
  blob: Blob;
  mimeType: SupportedImageMime;
  width: number;
  height: number;
};

async function encodeWithinLimit(
  bitmap: ImageBitmapLike,
  startWidth: number,
  startHeight: number,
  deps: ImagePipelineDeps,
): Promise<EncodedImage> {
  let width = startWidth;
  let height = startHeight;

  for (let attempt = 0; attempt < DOWNSCALE_STEPS; attempt += 1) {
    const canvas = deps.createCanvas(width, height);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context недоступен");
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const webp = await tryEncode(
      canvas,
      width,
      height,
      "image/webp",
      WEBP_QUALITIES,
    );

    if (webp) {
      return webp;
    }

    const jpeg = await tryEncode(
      canvas,
      width,
      height,
      "image/jpeg",
      JPEG_QUALITIES,
    );

    if (jpeg) {
      return jpeg;
    }

    const nextWidth = Math.max(1, Math.round(width * DOWNSCALE_FACTOR));
    const nextHeight = Math.max(1, Math.round(height * DOWNSCALE_FACTOR));

    if (nextWidth === width && nextHeight === height) {
      break;
    }

    width = nextWidth;
    height = nextHeight;
  }

  throw new ImageValidationError(
    "output_too_large",
    "Не удалось уменьшить изображение до 2 МБ",
  );
}

async function tryEncode(
  canvas: CanvasLike,
  width: number,
  height: number,
  mimeType: SupportedImageMime,
  qualities: readonly number[],
): Promise<EncodedImage | null> {
  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, mimeType, quality);

    if (blob.type !== mimeType || blob.size > MAX_OUTPUT_BYTES) {
      continue;
    }

    return { blob, mimeType, width, height };
  }

  return null;
}

function canvasToBlob(
  canvas: CanvasLike,
  mimeType: SupportedImageMime,
  quality: number,
): Promise<Blob> {
  if (canvas.convertToBlob) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }

  if (canvas.toBlob) {
    return new Promise((resolve, reject) => {
      canvas.toBlob!(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas не вернул Blob"));
          }
        },
        mimeType,
        quality,
      );
    });
  }

  return Promise.reject(new Error("Canvas не поддерживает экспорт Blob"));
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new Error("Web Crypto API недоступна в этом окружении");
  }

  const digest = await subtle.digest("SHA-256", new Uint8Array(bytes));

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function getDatabase(): Promise<IDBDatabase> {
  const factory = globalThis.indexedDB;

  if (!factory) {
    return Promise.reject(
      new Error("IndexedDB недоступен в этом окружении"),
    );
  }

  if (factory !== cachedFactory || !cachedDatabase) {
    cachedFactory = factory;
    const database = openDatabase(factory);
    cachedDatabase = database;
    database.catch(() => {
      if (cachedDatabase === database) {
        cachedFactory = null;
        cachedDatabase = null;
      }
    });

    return database;
  }

  return cachedDatabase;
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(IMAGE_DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(IMAGE_OBJECT_STORE)) {
        database.createObjectStore(IMAGE_OBJECT_STORE);
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => {
      reject(
        request.error ?? new Error("Не удалось открыть хранилище изображений"),
      );
    };
  });
}

async function writeBlob(mnemonicId: string, blob: Blob): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(IMAGE_OBJECT_STORE, "readwrite");
  const transactionDone = transactionAsPromise(transaction);

  transaction.objectStore(IMAGE_OBJECT_STORE).put(blob, mnemonicId);

  await transactionDone;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Ошибка запроса IndexedDB"));
  });
}

function transactionAsPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Ошибка транзакции IndexedDB"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Транзакция IndexedDB отменена"));
  });
}
