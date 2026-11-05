/**
 * route.ts — очередь текстовых вкладов для администратора.
 *
 * GET ?status=pending|approved|rejected|duplicate|withdrawn
 * По умолчанию отдаёт pending. Email и сырой идентификатор автора не
 * возвращаются: только псевдонимный contributorId.
 */

import { NextResponse } from "next/server";

import {
  isModerationStatus,
  listModerationQueue,
} from "@/lib/server/moderation";
import { getServerSession } from "@/lib/server/session";

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const requested = new URL(request.url).searchParams.get("status");
    if (requested !== null && !isModerationStatus(requested)) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    return NextResponse.json(await listModerationQueue(requested ?? "pending"));
  } catch {
    console.error("[admin:mnemonic-contributions:GET] request failed");
    return NextResponse.json(
      { error: "MODERATION_QUEUE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
