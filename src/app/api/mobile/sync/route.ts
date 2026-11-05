/**
 * route.ts — синхронизация полного прогресса мобильного клиента.
 *
 * Доступ только для активной VIP-подписки. Все чтения и записи ограничены
 * владельцем сессии; личные ассоциации синхронизируются без медиа.
 */

import { NextResponse } from "next/server";

import { mobileSyncBodySchema } from "@/lib/api/schemas";
import { requireVip } from "@/lib/server/entitlement";
import { applyProgress, loadProgress } from "@/lib/server/progress";
import { getServerSession } from "@/lib/server/session";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (!(await requireVip(session.user.id))) {
      return NextResponse.json({ error: "VIP_REQUIRED" }, { status: 403 });
    }

    return NextResponse.json(await loadProgress(session.user.id));
  } catch {
    console.error("[mobile/sync:GET] request failed");
    return NextResponse.json({ error: "SYNC_FAILED" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (!(await requireVip(session.user.id))) {
      return NextResponse.json({ error: "VIP_REQUIRED" }, { status: 403 });
    }

    const parsed = mobileSyncBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", details: parsed.error.flatten() }, { status: 400 });
    }

    const userId = session.user.id;
    await applyProgress(userId, parsed.data);
    return NextResponse.json(await loadProgress(userId));
  } catch {
    console.error("[mobile/sync:POST] request failed");
    return NextResponse.json({ error: "SYNC_FAILED" }, { status: 503 });
  }
}
