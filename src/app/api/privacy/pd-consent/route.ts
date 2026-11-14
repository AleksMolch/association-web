/**
 * route.ts — фиксация согласия на обработку ПДн для текущего пользователя.
 *
 * Нужен для аккаунтов, созданных до появления обязательного согласия.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { PD_CONSENT_VERSION, TERMS_VERSION } from "@/lib/pd-consent";
import { getServerSession } from "@/lib/server/session";

export async function POST() {
  const session = await getServerSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    await db
      .update(user)
      .set({
        pdConsentAt: new Date().toISOString(),
        pdConsentVersion: PD_CONSENT_VERSION,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: TERMS_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.user.id));
    return NextResponse.json({ ok: true, version: PD_CONSENT_VERSION });
  } catch (error) {
    console.error("[pd-consent]", error);
    return NextResponse.json({ error: "CONSENT_FAILED" }, { status: 503 });
  }
}
