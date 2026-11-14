/**
 * route.ts — согласие на cookie для авторизованного пользователя.
 *
 * POST добавляет новую запись в историю; GET возвращает последнюю.
 */

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { cookieConsents } from "@/lib/db/schema";
import { getServerSession } from "@/lib/server/session";

const bodySchema = z.object({
  version: z.string().min(1).max(64),
  necessary: z.boolean(),
  advertising: z.boolean(),
  analytics: z.boolean(),
  source: z.enum(["banner", "settings"]),
});

export async function GET() {
  const session = await getServerSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(cookieConsents)
      .where(eq(cookieConsents.userId, session.user.id))
      .orderBy(desc(cookieConsents.decidedAt))
      .limit(1);
    return NextResponse.json(rows[0] ?? null);
  } catch (error) {
    console.error("[cookie-consent:GET]", error);
    return NextResponse.json({ error: "CONSENT_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  try {
    await db.insert(cookieConsents).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      version: parsed.data.version,
      necessary: parsed.data.necessary,
      advertising: parsed.data.advertising,
      analytics: parsed.data.analytics,
      source: parsed.data.source,
      ipAddress,
      userAgent,
      decidedAt: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cookie-consent:POST]", error);
    return NextResponse.json({ error: "CONSENT_FAILED" }, { status: 503 });
  }
}
