"use client";

/**
 * progress-chart.tsx — график повторений за 7 дней на Recharts.
 */

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DayCount } from "@/lib/types";

export function ProgressChart({ days }: { days: DayCount[] }) {
  const data = days.map((entry) => ({
    ...entry,
    label: new Date(entry.day + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "short" }),
  }));

  return (
    <div className="h-56 w-full" role="img" aria-label="Количество повторений за последние 7 дней">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--color-primary-soft)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)" }}
          />
          <Bar dataKey="count" name="Повторений" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
