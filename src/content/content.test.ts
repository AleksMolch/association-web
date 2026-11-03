import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { content, words } from "@/content";

const imagesDir = path.join(process.cwd(), "public", "images", "words");

describe("content pack", () => {
  it("contains the final dictionary", () => {
    expect(content.version).toBeGreaterThan(0);
    expect(words).toHaveLength(1480);
    expect(words.reduce((sum, word) => sum + word.mnemonics.length, 0)).toBe(2668);
  });

  it("has unique word and mnemonic ids", () => {
    expect(new Set(words.map((word) => word.id)).size).toBe(words.length);
    const ids = words.flatMap((word) => word.mnemonics.map((mnemonic) => mnemonic.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every word learnable with at least one association", () => {
    for (const word of words) {
      expect(word.lemma.length).toBeGreaterThan(0);
      expect(word.meanings.length).toBeGreaterThan(0);
      expect(word.mnemonics.length).toBeGreaterThan(0);
    }
  });

  it("references existing illustrations or the placeholder", () => {
    let placeholders = 0;
    for (const word of words) {
      for (const mnemonic of word.mnemonics) {
        if (mnemonic.image === "placeholder.png") {
          placeholders += 1;
          continue;
        }
        expect(fs.existsSync(path.join(imagesDir, mnemonic.image)), `${word.lemma}: ${mnemonic.image}`).toBe(true);
      }
    }
    expect(placeholders).toBe(4);
  });
});
