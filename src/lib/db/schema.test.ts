import type { PgTable } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  contributionPreferences,
  mnemonicContributions,
  reviews,
  userMnemonics,
} from "./schema";

function columnNames(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("personal mnemonic schema", () => {
  it("defines all personal mnemonic columns", () => {
    expect(columnNames(userMnemonics).sort()).toEqual(
      [
        "id",
        "user_id",
        "word_id",
        "meaning_id",
        "cue_word",
        "scene_text",
        "locale",
        "created_at",
        "updated_at",
        "deleted_at",
        "rev",
      ].sort(),
    );
  });

  it("defines the partial owner/word index for active mnemonics", () => {
    const ownerWordIndex = getTableConfig(userMnemonics).indexes.find(
      (item) => item.config.name === "user_mnemonics_owner_word_idx",
    );

    expect(ownerWordIndex).toBeDefined();
    expect(ownerWordIndex?.config.unique).toBe(false);
    expect(ownerWordIndex?.config.where).toBeDefined();
  });
});

describe("contribution schema", () => {
  it("defines all contribution preference columns", () => {
    expect(columnNames(contributionPreferences).sort()).toEqual(
      [
        "user_id",
        "status",
        "consent_version",
        "decided_at",
        "next_prompt_at",
        "updated_at",
      ].sort(),
    );
  });

  it("defines all mnemonic contribution columns", () => {
    expect(columnNames(mnemonicContributions).sort()).toEqual(
      [
        "id",
        "client_contribution_id",
        "contributor_user_id",
        "source_mnemonic_id",
        "word_id",
        "meaning_id",
        "cue_word",
        "scene_text",
        "locale",
        "consent_version",
        "submitted_at",
        "status",
        "normalized_hash",
        "moderation_reason",
        "reviewed_by",
        "reviewed_at",
        "created_at",
      ].sort(),
    );
  });

  it("defines contribution idempotency and moderation queue indexes", () => {
    const indexes = new Map(
      getTableConfig(mnemonicContributions).indexes.map((item) => [
        item.config.name,
        item.config,
      ]),
    );

    expect(
      indexes.get("mnemonic_contributions_contributor_client_uq")?.unique,
    ).toBe(true);
    expect(indexes.get("mnemonic_contributions_queue_idx")?.unique).toBe(false);
  });
});

describe("review schema", () => {
  it("extends reviews with exercise type and answer", () => {
    expect(columnNames(reviews)).toEqual(
      expect.arrayContaining(["exercise_type", "answer"]),
    );
  });
});
