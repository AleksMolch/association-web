/**
 * route.ts — очередь текстовых вкладов для администратора.
 *
 * GET ?status=pending|approved|rejected|duplicate|withdrawn&limit=&offset=
 * По умолчанию pending, limit 50, максимум 200. Email и сырой идентификатор
 * автора не возвращаются: только псевдонимный contributorId.
 */

import { NextResponse } from "next/server";

import {
  isModerationStatus,
  listModerationQueue,
  MODERATION_QUEUE_DEFAULT_LIMIT,
  MODERATION_QUEUE_MAX_LIMIT,
} from "@/lib/server/moderation";
import { getServerSession } from "@/lib/server/session";

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const requested = searchParams.get("status");
    if (requested !== null && !isModerationStatus(requested)) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    const limit = parseBoundedInteger(
      searchParams.get("limit"),
      MODERATION_QUEUE_DEFAULT_LIMIT,
      1,
      MODERATION_QUEUE_MAX_LIMIT,
    );
    const offset = parseBoundedInteger(
      searchParams.get("offset"),
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (limit === null || offset === null) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    return NextResponse.json(
      await listModerationQueue({ status: requested ?? "pending", limit, offset }),
    );
  } catch {
    console.error("[admin:mnemonic-contributions:GET] request failed");
    return NextResponse.json(
      { error: "MODERATION_QUEUE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
