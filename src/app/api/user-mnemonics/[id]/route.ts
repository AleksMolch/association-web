/**
 * route.ts — изменение и удаление одной личной ассоциации владельца.
 *
 * PATCH  — обновляет текст и увеличивает rev.
 * DELETE — ставит tombstone; повторное удаление идемпотентно.
 * Чужие, отсутствующие и удалённые записи дают 404.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { userMnemonicInputSchema } from "@/features/user-mnemonics/schemas";
import { deleteUserMnemonic, updateUserMnemonic } from "@/lib/server/user-mnemonics";
import { getServerSession } from "@/lib/server/session";

const updateBodySchema = z
  .object({
    cueWord: userMnemonicInputSchema.shape.cueWord.optional(),
    sceneText: userMnemonicInputSchema.shape.sceneText.optional(),
  })
  .strict()
  .refine((value) => value.cueWord !== undefined || value.sceneText !== undefined, {
    message: "EMPTY_UPDATE",
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const parsed = updateBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const updated = await updateUserMnemonic(session.user.id, id, parsed.data);
    if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[user-mnemonics:PATCH]", error);
    return NextResponse.json({ error: "USER_MNEMONIC_UPDATE_FAILED" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await context.params;
    const deleted = await deleteUserMnemonic(session.user.id, id);
    if (!deleted) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    return NextResponse.json(deleted);
  } catch (error) {
    console.error("[user-mnemonics:DELETE]", error);
    return NextResponse.json({ error: "USER_MNEMONIC_DELETE_FAILED" }, { status: 503 });
  }
}
