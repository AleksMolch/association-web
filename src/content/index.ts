/**
 * index.ts — доступ к контент-паку и иллюстрациям.
 *
 * Слова импортируются из words.json. Картинки лежат в public/images/words,
 * поэтому URL строится как обычная публичная ссылка (без require).
 */

import pack from "./words.json";
import type { ContentPack, Mnemonic, Word } from "./types";

export const content = pack as ContentPack;
export const words: Word[] = content.words;
export const wordById: Map<number, Word> = new Map(words.map((word) => [word.id, word]));

export function getWord(id: number): Word | undefined {
  return wordById.get(id);
}

export function getMnemonic(
  word: Word,
  mnemonicId: string | null | undefined,
): Mnemonic | undefined {
  if (!mnemonicId) return undefined;
  return word.mnemonics.find((item) => item.id === mnemonicId);
}

export function primaryMnemonic(word: Word): Mnemonic {
  return [...word.mnemonics].sort((a, b) => a.sortOrder - b.sortOrder)[0];
}

/** Публичный URL иллюстрации; отсутствующие файлы получают плейсхолдер. */
export function imageUrl(filename: string): string {
  if (!filename || filename === "placeholder.png") return "/images/placeholder.png";
  return "/images/words/" + filename;
}

export const demoWords: Word[] = words.filter((word) => word.mnemonics.length >= 2).slice(0, 3);
