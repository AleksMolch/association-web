/**
 * schemas.ts — строгие Zod-схемы и хеширование текста ассоциаций.
 *
 * Модуль не зависит от браузерных API: те же правила нормализации и хеша
 * должны работать в мобильном приложении и веб-версии.
 */

import { z } from "zod";

import { CONSENT_VERSION } from "./types";

export { CONSENT_VERSION };

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const INITIAL_HASH = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
] as const;

/** Строго валидирует пользовательскую ассоциацию без изображений. */
export const userMnemonicInputSchema = z
  .object({
    cueWord: z.string().trim().min(1).max(80),
    sceneText: z.string().trim().min(5).max(500),
    meaningId: z.string().min(1).max(32),
  })
  .strict();

/** Статус добровольного участия в улучшении сервиса. */
export const contributionConsentSchema = z.enum([
  "unset",
  "granted",
  "declined",
  "ask_later",
  "withdrawn",
]);

/** Строго валидирует текстовый вклад без файлов и метаданных изображения. */
export const contributionInputSchema = z
  .object({
    clientContributionId: z.string().uuid(),
    sourceMnemonicId: z.string().uuid(),
    wordId: z.number().int().positive(),
    meaningId: z.string().min(1).max(32),
    cueWord: z.string().trim().min(1).max(80),
    sceneText: z.string().trim().min(5).max(500),
    locale: z.literal("ru"),
    consentVersion: z.string().min(1).max(32),
    submittedAt: z.string().datetime(),
  })
  .strict();

/** Строго валидирует настройку согласия на отправку вкладов. */
export const contributionPreferenceSchema = z
  .object({
    status: contributionConsentSchema,
    consentVersion: z.string().min(1).max(32),
  })
  .strict();

/**
 * Приводит текст к каноническому виду: Unicode NFKC, обрезка краёв и
 * схлопывание любых последовательностей пробельных символов в один пробел.
 */
export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * Считает детерминированный SHA-256 хеш контракта в hex.
 *
 * Вход — нормализованное созвучие в нижнем регистре, перевод строки и
 * нормализованное описание сцены. Регистр созвучия на хеш не влияет.
 */
export function contributionHash(cueWord: string, sceneText: string): string {
  const canonicalCue = normalizeText(cueWord).toLowerCase();
  const canonicalScene = normalizeText(sceneText);

  return sha256Hex(`${canonicalCue}\n${canonicalScene}`);
}

/** Считает SHA-256 хеш произвольной строки в hex (UTF-8). */
export function sha256Hex(value: string): string {
  const bytes = utf8Bytes(value);
  const bitLength = bytes.length * 8;
  const padded = [...bytes, 0x80];

  while (padded.length % 64 !== 56) {
    padded.push(0);
  }

  const high = Math.floor(bitLength / 0x100000000) >>> 0;
  const low = bitLength >>> 0;
  padded.push(
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
  );

  const hash: number[] = [...INITIAL_HASH];
  const words = new Array<number>(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] =
        ((padded[start] << 24) |
          (padded[start + 1] << 16) |
          (padded[start + 2] << 8) |
          padded[start + 3]) >>>
        0;
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        (rotr(words[index - 15], 7) ^
          rotr(words[index - 15], 18) ^
          (words[index - 15] >>> 3)) >>>
        0;
      const s1 =
        (rotr(words[index - 2], 17) ^
          rotr(words[index - 2], 19) ^
          (words[index - 2] >>> 10)) >>>
        0;
      words[index] =
        (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let index = 0; index < 64; index += 1) {
      const sigma1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const choose = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + sigma1 + choose + SHA256_K[index] + words[index]) >>> 0;
      const sigma0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (sigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function rotr(value: number, shift: number): number {
  return ((value >>> shift) | (value << (32 - shift))) >>> 0;
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;

      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return bytes;
}
