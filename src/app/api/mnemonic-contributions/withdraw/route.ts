/**
 * route.ts — отзыв ранее переданных текстовых вкладов.
 *
 * Пользователь передаёт идентификаторы своих исходных ассоциаций; сервер
 * помечает только собственные записи со статусами pending/approved/duplicate.
 * Опубликованные и уже отозванные записи не меняются, чужие — недоступны.
 */

import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { mnemonicContributions as mnemonicContributionsTable } from "@/lib/db/schema";
import { getServerSession } from "@/lib/server/session";

const WITHDRAWABLE_STATUSES = ["pending", "approved", "duplicate"] as const;

const withdrawBodySchema = z
  .object({
    sourceMnemonicIds: z.array(z.string().min(1).max(128)).max(200),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const parsed = withdrawBodySchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const sourceMnemonicIds = [...new Set(parsed.data.sourceMnemonicIds)];
    if (sourceMnemonicIds.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const updated = await db
      .update(mnemonicContributionsTable)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(mnemonicContributionsTable.contributorUserId, session.user.id),
          inArray(
            mnemonicContributionsTable.sourceMnemonicId,
            sourceMnemonicIds,
          ),
          inArray(mnemonicContributionsTable.status, [...WITHDRAWABLE_STATUSES]),
        ),
      )
      .returning({ id: mnemonicContributionsTable.id });

    return NextResponse.json({ count: updated.length });
  } catch {
    console.error("[mnemonic-contributions:withdraw] request failed");
    return NextResponse.json(
      { error: "CONTRIBUTION_WITHDRAW_FAILED" },
      { status: 503 },
    );
  }
}
