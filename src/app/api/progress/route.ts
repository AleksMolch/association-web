/**
 * route.ts — облачный прогресс авторизованного пользователя.
 *
 * GET  — отдаёт карточки, выбранные ассоциации и настройки.
 * POST — принимает локальный снимок и выполняет last-write-wins по rev.
 *
 * Контент словаря не синхронизируется: он одинаков у клиента и сервера.
 */

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { syncBodySchema } from "@/lib/api/schemas";
import { db } from "@/lib/db";
import { cards as cardsTable, reviews as reviewsTable, selections as selectionsTable, settings as settingsTable } from "@/lib/db/schema";
import { getServerSession } from "@/lib/server/session";
import { selectionMap, toCardInsert, toCardRow, toSettings } from "@/lib/server/progress";


async function loadProgress(userId: string) {
  const [cardRows, selectionRows, settingsRows] = await Promise.all([
    db.select().from(cardsTable).where(eq(cardsTable.userId, userId)),
    db.select().from(selectionsTable).where(eq(selectionsTable.userId, userId)),
    db.select().from(settingsTable).where(eq(settingsTable.userId, userId)),
  ]);
  return {
    cards: cardRows.map(toCardRow),
    selections: selectionMap(selectionRows),
    settings: toSettings(settingsRows[0]),
  };
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    return NextResponse.json(await loadProgress(session.user.id));
  } catch (error) {
    console.error("[progress:GET]", error);
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
    const { cards, selections, settings, reviews } = parsed.data;

    await db.transaction(async (tx) => {
      for (const row of cards) {
        const values = toCardInsert(userId, row);
        await tx
          .insert(cardsTable)
          .values(values)
          .onConflictDoUpdate({
            target: [cardsTable.userId, cardsTable.wordId],
            set: {
              due: values.due,
              stability: values.stability,
              difficulty: values.difficulty,
              scheduledDays: values.scheduledDays,
              reps: values.reps,
              lapses: values.lapses,
              learningSteps: values.learningSteps,
              state: values.state,
              lastReview: values.lastReview,
              updatedAt: values.updatedAt,
              rev: values.rev,
            },
            setWhere: sql`${cardsTable.rev} < excluded.rev`,
          });
      }

      for (const [wordId, mnemonicId] of Object.entries(selections)) {
        await tx
          .insert(selectionsTable)
          .values({ id: `${userId}:${wordId}`, userId, wordId: Number(wordId), mnemonicId, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [selectionsTable.userId, selectionsTable.wordId],
            set: { mnemonicId, updatedAt: new Date() },
          });
      }

      await tx
        .insert(settingsTable)
        .values({ userId, ...settings, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settingsTable.userId,
          set: { ...settings, updatedAt: new Date() },
        });

      for (const review of reviews) {
        await tx
          .insert(reviewsTable)
          .values({
            id: `${userId}:${review.id}`,
            userId,
            cardId: `${userId}:${review.cardId}`,
            rating: review.rating,
            usedHint: review.usedHint,
            createdAt: new Date(review.createdAt),
          })
          .onConflictDoNothing();
      }
    });

    return NextResponse.json(await loadProgress(userId));
  } catch (error) {
    console.error("[progress:POST]", error);
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
  } catch (error) {
    console.error("[progress:DELETE]", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 503 });
  }
}
