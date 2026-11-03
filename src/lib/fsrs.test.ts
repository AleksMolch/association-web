import { describe, expect, it } from "vitest";

import { applyRating, createNewCard, formatNextReview, isDue, stateLabel } from "@/lib/fsrs";

const start = new Date("2026-01-01T09:00:00.000Z");

describe("FSRS adapter", () => {
  it("creates a due new card with a stable id", () => {
    const card = createNewCard(42, start);
    expect(card.wordId).toBe(42);
    expect(card.id).toBe("42:0:en-ru");
    expect(card.reps).toBe(0);
    expect(card.rev).toBe(1);
    expect(isDue(card, start)).toBe(true);
  });

  it("applies Good and increments revision without losing identity", () => {
    const card = createNewCard(42, start);
    const reviewed = applyRating(card, 3, start);
    expect(reviewed.id).toBe(card.id);
    expect(reviewed.reps).toBe(1);
    expect(reviewed.rev).toBe(2);
    expect(reviewed.lastReview).toBe(start.toISOString());
    expect(new Date(reviewed.due).getTime()).toBeGreaterThan(start.getTime());
  });

  it("moves Again into learning and counts a lapse after review state", () => {
    const card = createNewCard(7, start);
    const good = applyRating(card, 3, start);
    const again = applyRating(good, 1, new Date(start.getTime() + 60_000));
    expect(again.lapses).toBeGreaterThanOrEqual(good.lapses);
    expect(again.reps).toBe(2);
  });

  it("formats near and far intervals", () => {
    expect(formatNextReview(new Date(start.getTime() - 60_000).toISOString(), start)).toBe("сейчас");
    expect(formatNextReview(new Date(start.getTime() + 10 * 60_000).toISOString(), start)).toBe("через 10 мин");
  });

  it("labels FSRS states", () => {
    expect(stateLabel(0)).toBe("Новая");
    expect(stateLabel(1)).toBe("Изучается");
    expect(stateLabel(2)).toBe("Повторение");
    expect(stateLabel(3)).toBe("Переучивание");
  });
});
