/**
 * page.tsx — страница слова.
 *
 * Параметры маршрута читаются в Suspense-обёртке: так страница остаётся
 * совместимой с Cache Components и не блокирует пререндер.
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";

import { WordDetail } from "@/components/dashboard/word-detail";
import { Card } from "@/components/ui/card";
import { getWord } from "@/content";

async function WordDetailLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wordId = Number(id);
  if (!Number.isInteger(wordId) || !getWord(wordId)) notFound();
  return <WordDetail wordId={wordId} />;
}

export default function WordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Card><p className="text-sm text-muted">Загружаем слово…</p></Card>}>
      <WordDetailLoader params={params} />
    </Suspense>
  );
}
