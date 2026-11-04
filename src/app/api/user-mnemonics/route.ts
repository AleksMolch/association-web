/**
 * route.ts — коллекция личных ассоциаций авторизованного пользователя.
 *
 * GET  — активные записи владельца сессии, опционально по wordId.
 * POST — создание текстовой ассоциации без медиа и клиентского userId.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getWord } from "@/content";
import { userMnemonicInputSchema } from "@/features/user-mnemonics/schemas";
import { createUserMnemonic, listUserMnemonics } from "@/lib/server/user-mnemonics";
import { getServerSession } from "@/lib/server/session";

const createBodySchema = userMnemonicInputSchema
  .extend({ wordId: z.number().int().positive() })
  .strict();

function parseWordIdQuery(value: string | null): number | undefined | null {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const wordId = parseWordIdQuery(new URL(request.url).searchParams.get("wordId"));
    if (wordId === null) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
    }
    if (wordId !== undefined && !getWord(wordId)) {
      return NextResponse.json({ error: "INVALID_WORD" }, { status: 400 });
    }

    return NextResponse.json(await listUserMnemonics(session.user.id, wordId));
  } catch (error) {
    console.error("[user-mnemonics:GET]", error);
    return NextResponse.json({ error: "USER_MNEMONICS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const parsed = createBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (!getWord(parsed.data.wordId)) {
      return NextResponse.json({ error: "INVALID_WORD" }, { status: 400 });
    }

    const created = await createUserMnemonic(session.user.id, parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[user-mnemonics:POST]", error);
    return NextResponse.json({ error: "USER_MNEMONIC_CREATE_FAILED" }, { status: 503 });
  }
}
