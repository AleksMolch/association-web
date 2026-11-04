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

async function WordDetailLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const wordId = Number(id);
  if (!Number.isInteger(wordId) || !getWord(wordId)) notFound();
  const edit = typeof query.edit === "string" ? query.edit : null;
  return <WordDetail wordId={wordId} initialEditId={edit} />;
}

export default function WordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense fallback={<Card><p className="text-sm text-muted">Загружаем слово…</p></Card>}>
      <WordDetailLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}
