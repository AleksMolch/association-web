"use client";

/**
 * page.tsx — список слов кабинета.
 *
 * Поиск и фильтры по статусу FSRS. Список не показывает ассоциацию постоянно:
 * только слово, перевод и состояние.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { words } from "@/content";
import { isDue, stateLabel } from "@/lib/fsrs";
import { useGuest } from "@/lib/guest-store";
import { cn } from "@/lib/utils";

type Filter = "all" | "due" | "new" | "learning" | "hard";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "due", label: "К повторению" },
  { key: "new", label: "Новые" },
  { key: "learning", label: "Изучаются" },
  { key: "hard", label: "Сложные" },
];

export default function DashboardWordsPage() {
  const { ready, cardByWord, preferred } = useGuest();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(100);

  const rows = useMemo(() => {
    if (!ready) return [];
    const normalized = query.trim().toLowerCase();
    const now = new Date();
    return words.filter((word) => {
      if (normalized) {
        const haystack = `${word.lemma} ${word.meanings.join(" ")}`.toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }
      const card = cardByWord.get(word.id);
      if (filter === "due") return Boolean(card && isDue(card, now));
      if (filter === "new") return !card;
      if (filter === "learning") return Boolean(card && (card.state === 1 || card.state === 3));
      if (filter === "hard") return Boolean(card && card.lapses >= 3);
      return true;
    });
  }, [ready, query, filter, cardByWord]);

  if (!ready) return <p className="text-sm text-muted">Загружаем слова…</p>;

  const visible = rows.slice(0, limit);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Словарь</p>
          <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Слова</h1>
        </div>
        <p className="text-sm text-muted">Найдено: {rows.length}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Поиск слов</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(100);
            }}
            placeholder="Поиск: слово или перевод"
            className="pl-9"
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Фильтр слов">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={filter === entry.key}
              onClick={() => {
                setFilter(entry.key);
                setLimit(100);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === entry.key
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {visible.length === 0 ? (
          <p className="p-6 text-sm text-muted">Ничего не найдено. Измените запрос или фильтр.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((word) => {
              const card = cardByWord.get(word.id);
              const due = card ? isDue(card) : false;
              const status = card ? (due ? "К повторению" : stateLabel(card.state)) : "Новое";
              const hasMnemonic = preferred.has(word.id);
              return (
                <li key={word.id}>
                  <Link
                    href={`/dashboard/words/${word.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-warm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink">{word.lemma}</span>
                        {hasMnemonic ? <span className="text-[10px] text-primary">●</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">{word.meanings[0]}</span>
                    </span>
                    <Badge variant={!card ? "primary" : due ? "coral" : "outline"}>{status}</Badge>
                    <span className="w-20 text-right text-[11px] tabular-nums text-muted">
                      {card ? `повторов: ${card.reps}` : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {visible.length < rows.length ? (
        <Button variant="secondary" onClick={() => setLimit((prev) => prev + 100)}>
          Показать ещё 100
        </Button>
      ) : null}
    </div>
  );
}
