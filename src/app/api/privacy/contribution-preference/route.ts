/**
 * route.ts — настройка согласия на отправку вкладов.
 *
 * GET  — возвращает решение текущего пользователя или unset по умолчанию.
 * PUT  — валидирует статус и версию согласия, затем выполняет upsert.
 *
 * Оба обработчика работают только с владельцем сессии: userId из тела
 * запроса запрещён строгой схемой.
 */

import { NextResponse } from "next/server";

import { contributionPreferenceSchema } from "@/features/user-mnemonics/schemas";
import {
  getContributionPreference,
  setContributionPreference,
} from "@/lib/server/contributions";
import { getServerSession } from "@/lib/server/session";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    return NextResponse.json(await getContributionPreference(session.user.id));
  } catch (error) {
    console.error("[contribution-preference:GET]", error);
    return NextResponse.json({ error: "PREFERENCE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const parsed = contributionPreferenceSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json(await setContributionPreference(session.user.id, parsed.data));
  } catch (error) {
    console.error("[contribution-preference:PUT]", error);
    return NextResponse.json({ error: "PREFERENCE_UPDATE_FAILED" }, { status: 503 });
  }
}
