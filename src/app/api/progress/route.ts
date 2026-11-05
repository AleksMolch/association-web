/**
 * route.ts — облачный прогресс авторизованного пользователя.
 *
 * GET  — отдаёт карточки, выбранные ассоциации, настройки и личные ассоциации.
 * POST — принимает локальный снимок и выполняет last-write-wins по rev.
 *
 * Контент словаря не синхронизируется: он одинаков у клиента и сервера.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { syncBodySchema } from "@/lib/api/schemas";
import { db } from "@/lib/db";
import { cards as cardsTable, reviews as reviewsTable, selections as selectionsTable, settings as settingsTable } from "@/lib/db/schema";
import { applyProgress, loadProgress, toWebProgress } from "@/lib/server/progress";
import { getServerSession } from "@/lib/server/session";


export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    return NextResponse.json(toWebProgress(await loadProgress(session.user.id)));
  } catch {
    console.error("[progress:GET] request failed");
    return NextResponse.json({ error: "PROGRESS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const parsed = syncBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", details: parsed.error.flatten() }, { status: 400 });
    }

    const userId = session.user.id;
    await applyProgress(userId, parsed.data);
    return NextResponse.json(toWebProgress(await loadProgress(userId)));
  } catch {
    console.error("[progress:POST] request failed");
    return NextResponse.json({ error: "SYNC_FAILED" }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const userId = session.user.id;
    await db.transaction(async (tx) => {
      await tx.delete(reviewsTable).where(eq(reviewsTable.userId, userId));
      await tx.delete(cardsTable).where(eq(cardsTable.userId, userId));
      await tx.delete(selectionsTable).where(eq(selectionsTable.userId, userId));
      await tx.delete(settingsTable).where(eq(settingsTable.userId, userId));
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[progress:DELETE] request failed");
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 503 });
  }
}
