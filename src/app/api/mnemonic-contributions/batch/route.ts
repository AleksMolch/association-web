/**
 * route.ts — приём текстовых вкладов от авторизованного пользователя.
 *
 * Тело — строго `{ items: MnemonicContributionInput[] }`, не более 50 записей.
 * Серверное согласие должно быть `granted`; неизвестные слова не попадают в
 * БД, дубликаты определяются по clientContributionId и нормализованному хешу.
 * Подозрительный текст (email/phone/url) сохраняется только как pending с
 * причиной для ручной модерации и никогда не одобряется автоматически.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getWord } from "@/content";
import {
  contributionHash,
  contributionInputSchema,
  normalizeText,
} from "@/features/user-mnemonics/schemas";
import { db } from "@/lib/db";
import { mnemonicContributions as mnemonicContributionsTable } from "@/lib/db/schema";
import { detectSensitiveContent } from "@/lib/server/contribution-filter";
import { consumeContributionBatchAllowance } from "@/lib/server/contribution-rate-limit";
import { getContributionPreference } from "@/lib/server/contributions";
import { getServerSession } from "@/lib/server/session";

const batchBodySchema = z
  .object({
    items: z.array(contributionInputSchema).min(1).max(50),
  })
  .strict();

type InsertRow = typeof mnemonicContributionsTable.$inferInsert;

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const userId = session.user.id;
    const preference = await getContributionPreference(userId);
    if (preference.status !== "granted") {
      return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 403 });
    }

    if (!consumeContributionBatchAllowance(userId)) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const parsed = batchBodySchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const accepted: string[] = [];
      const duplicateIds = new Set<string>();
      const rejected: { clientContributionId: string; reason: string }[] = [];
      const rows: InsertRow[] = [];
      const seenClientIds = new Set<string>();
      const seenHashes = new Set<string>();

      for (const item of parsed.data.items) {
        if (!getWord(item.wordId)) {
          rejected.push({
            clientContributionId: item.clientContributionId,
            reason: "unknown_word",
          });
          continue;
        }

        const cueWord = normalizeText(item.cueWord);
        const sceneText = normalizeText(item.sceneText);
        const normalizedHash = contributionHash(cueWord, sceneText);
        const hashKey = `${item.wordId}\u0000${normalizedHash}`;

        if (
          seenClientIds.has(item.clientContributionId) ||
          seenHashes.has(hashKey)
        ) {
          duplicateIds.add(item.clientContributionId);
          continue;
        }

        const [clientDuplicate] = await tx
          .select()
          .from(mnemonicContributionsTable)
          .where(
            and(
              eq(mnemonicContributionsTable.contributorUserId, userId),
              eq(
                mnemonicContributionsTable.clientContributionId,
                item.clientContributionId,
              ),
            ),
          );
        if (clientDuplicate) {
          duplicateIds.add(item.clientContributionId);
          continue;
        }

        const [hashDuplicate] = await tx
          .select()
          .from(mnemonicContributionsTable)
          .where(
            and(
              eq(mnemonicContributionsTable.contributorUserId, userId),
              eq(mnemonicContributionsTable.wordId, item.wordId),
              eq(mnemonicContributionsTable.normalizedHash, normalizedHash),
            ),
          );
        if (hashDuplicate) {
          duplicateIds.add(item.clientContributionId);
          continue;
        }

        seenClientIds.add(item.clientContributionId);
        seenHashes.add(hashKey);

        const flags = detectSensitiveContent(`${cueWord}\n${sceneText}`);
        const sensitiveFlags = Object.entries(flags)
          .filter(([, flagged]) => flagged)
          .map(([flag]) => flag);

        rows.push({
          id: crypto.randomUUID(),
          clientContributionId: item.clientContributionId,
          contributorUserId: userId,
          sourceMnemonicId: item.sourceMnemonicId,
          wordId: item.wordId,
          meaningId: item.meaningId,
          cueWord,
          sceneText,
          locale: item.locale,
          consentVersion: item.consentVersion,
          submittedAt: new Date(item.submittedAt),
          status: "pending",
          normalizedHash,
          moderationReason:
            sensitiveFlags.length > 0
              ? `sensitive_content:${sensitiveFlags.join(",")}`
              : null,
          createdAt: now,
        });
      }

      if (rows.length > 0) {
        const inserted = await tx
          .insert(mnemonicContributionsTable)
          .values(rows)
          .onConflictDoNothing({
            target: [
              mnemonicContributionsTable.contributorUserId,
              mnemonicContributionsTable.clientContributionId,
            ],
          })
          .returning({
            clientContributionId:
              mnemonicContributionsTable.clientContributionId,
          });

        const insertedIds = new Set(
          inserted.map((row) => row.clientContributionId),
        );
        for (const row of rows) {
          if (insertedIds.has(row.clientContributionId)) {
            accepted.push(row.clientContributionId);
          } else {
            duplicateIds.add(row.clientContributionId);
          }
        }
      }

      const duplicateIdList = [...duplicateIds];
      return {
        accepted: { count: accepted.length, ids: accepted },
        duplicates: { count: duplicateIdList.length, ids: duplicateIdList },
        rejected: { count: rejected.length, items: rejected },
      };
    });

    return NextResponse.json(result);
  } catch {
    console.error("[mnemonic-contributions:batch] request failed");
    return NextResponse.json(
      { error: "CONTRIBUTION_BATCH_FAILED" },
      { status: 503 },
    );
  }
}
