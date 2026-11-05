/**
 * page.tsx — очередь модерации пользовательских текстовых вкладов.
 *
 * Доступ только для role=admin. Показывает текст, перевод, произношение,
 * флаги и псевдонимный id автора; email не выводится. Approve означает
 * одобрение для ручной редактуры, а не публикацию контента.
 */

import Link from "next/link";

import { DecisionControls } from "./decision-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  isModerationStatus,
  listModerationQueue,
  MODERATION_STATUSES,
  type ModerationQueueItem,
} from "@/lib/server/moderation";
import { getServerSession } from "@/lib/server/session";

export const instant = false;

const STATUS_LABELS: Record<string, string> = {
  pending: "На проверке",
  approved: "Одобрено",
  rejected: "Отклонено",
  duplicate: "Дубликат",
  withdrawn: "Отозвано",
};

type ContributionsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ContributionsPage({
  searchParams,
}: ContributionsPageProps) {
  const session = await getServerSession().catch(() => undefined);

  if (session === undefined) return <SetupMessage />;
  if (!session) {
    return (
      <Card className="mx-auto mt-16 max-w-lg text-center">
        <CardHeader>
          <CardTitle>Нужен вход</CardTitle>
          <CardDescription>
            Очередь модерации доступна только после авторизации.
          </CardDescription>
        </CardHeader>
        <Link href="/login" className={buttonVariants()}>
          Войти
        </Link>
      </Card>
    );
  }
  if (session.user.role !== "admin") {
    return (
      <Card className="mx-auto mt-16 max-w-lg text-center">
        <CardHeader>
          <CardTitle>Доступ запрещён</CardTitle>
          <CardDescription>
            У вашей учётной записи нет роли admin.
          </CardDescription>
        </CardHeader>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "secondary" })}
        >
          В кабинет
        </Link>
      </Card>
    );
  }

  const query = await searchParams;
  const requested = typeof query.status === "string" ? query.status : "pending";
  const status = isModerationStatus(requested) ? requested : "pending";
  const queue = await listModerationQueue(status).catch(() => null);
  if (!queue) return <SetupMessage />;

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Админка · модерация</p>
          <h1 className="font-serif text-3xl font-semibold text-ink">
            Вклады пользователей
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Одобрение помечает вклад для ручной редактуры. Контент не
            публикуется автоматически.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            В админку
          </Link>
          <Badge variant="outline">{queue.length} записей</Badge>
        </div>
      </div>

      <nav aria-label="Фильтр по статусу" className="mb-4 flex flex-wrap gap-2">
        {MODERATION_STATUSES.map((item) => (
          <Link
            key={item}
            href={`/admin/contributions?status=${item}`}
            className={buttonVariants({
              variant: item === status ? "primary" : "secondary",
              size: "sm",
            })}
          >
            {STATUS_LABELS[item]}
          </Link>
        ))}
      </nav>

      {queue.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Очередь пуста</CardTitle>
            <CardDescription>
              Нет вкладов со статусом «{STATUS_LABELS[status]}».
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Слово</th>
                <th className="py-2 pr-3 font-medium">Вклад</th>
                <th className="py-2 pr-3 font-medium">Флаги</th>
                <th className="py-2 pr-3 font-medium">Дубликаты</th>
                <th className="py-2 pr-3 font-medium">Автор</th>
                <th className="py-2 pr-3 font-medium">Даты</th>
                <th className="py-2 pr-3 font-medium">Статус</th>
                <th className="py-2 font-medium">Решение</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <QueueRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}

function QueueRow({ item }: { item: ModerationQueueItem }) {
  const flags = Object.entries(item.flags)
    .filter(([, flagged]) => flagged)
    .map(([flag]) => flag);

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="py-3 pr-3">
        <p className="font-medium text-ink">{item.word ?? `word ${item.wordId}`}</p>
        <p className="text-xs text-muted">{item.translation ?? "—"}</p>
        <p className="text-xs text-muted">
          {item.pronunciation ?? "—"}
          {item.ipa ? ` · ${item.ipa}` : ""}
        </p>
      </td>
      <td className="py-3 pr-3">
        <p className="font-medium text-ink">{item.cueWord}</p>
        <p className="max-w-md whitespace-pre-wrap text-muted">{item.sceneText}</p>
        <p className="mt-1 text-xs text-muted">
          {item.locale} · consent {item.consentVersion}
        </p>
      </td>
      <td className="py-3 pr-3">
        {flags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {flags.map((flag) => (
              <Badge key={flag} variant="coral">
                {flag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
        {item.moderationReason ? (
          <p className="mt-1 max-w-48 text-xs text-muted">
            {item.moderationReason}
          </p>
        ) : null}
      </td>
      <td className="py-3 pr-3 text-muted">
        {item.duplicateCount > 0
          ? `${item.duplicateCount} · ${item.duplicateScore.toFixed(1)}`
          : "—"}
      </td>
      <td className="py-3 pr-3">
        <p className="font-mono text-xs text-muted">
          {item.contributorId ?? "аноним"}
        </p>
      </td>
      <td className="py-3 pr-3 text-xs text-muted">
        <p>Отправлен: {formatDateTime(item.submittedAt)}</p>
        {item.reviewedAt ? (
          <p>Проверен: {formatDateTime(item.reviewedAt)}</p>
        ) : null}
      </td>
      <td className="py-3 pr-3">
        <Badge variant={item.status === "approved" ? "success" : "default"}>
          {STATUS_LABELS[item.status] ?? item.status}
        </Badge>
      </td>
      <td className="py-3">
        <DecisionControls contributionId={item.id} status={item.status} />
      </td>
    </tr>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function SetupMessage() {
  return (
    <main id="main" className="mx-auto mt-16 w-full max-w-lg px-5">
      <Card>
        <CardHeader>
          <CardTitle>База данных не готова</CardTitle>
          <CardDescription>
            Проверьте DATABASE_URL, примените миграции и задайте роль admin
            пользователю. Подробности — в docs/OPERATIONS.md.
          </CardDescription>
        </CardHeader>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          На главную
        </Link>
      </Card>
    </main>
  );
}
