/**
 * route.ts — решение модератора по одному текстовому вкладу.
 *
 * POST body: { action, reason? }. approve/reject/duplicate/withdraw меняют
 * статус, needs_edit оставляет pending и сохраняет причину. Approve означает
 * «одобрено для ручной редактуры», а не публикацию контента. Withdrawn —
 * терминальный статус: другие действия возвращают 409.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  applyModerationDecision,
  MODERATION_ACTIONS,
} from "@/lib/server/moderation";
import { getServerSession } from "@/lib/server/session";

const decisionBodySchema = z
  .object({
    action: z.enum(MODERATION_ACTIONS),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.action === "reject" || value.action === "needs_edit") &&
      !value.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "REASON_REQUIRED",
      });
    }
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const parsed = decisionBodySchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const outcome = await applyModerationDecision({
      id,
      action: parsed.data.action,
      reason: parsed.data.reason,
      reviewerId: session.user.id,
    });
    if (outcome.outcome === "not_found") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (outcome.outcome === "withdrawn") {
      return NextResponse.json(
        { error: "WITHDRAWN_TERMINAL" },
        { status: 409 },
      );
    }

    return NextResponse.json(outcome.result);
  } catch {
    console.error("[admin:mnemonic-contributions:decision] request failed");
    return NextResponse.json(
      { error: "MODERATION_DECISION_FAILED" },
      { status: 503 },
    );
  }
}
