/**
 * page.tsx — страница веб-занятия.
 */

import type { Metadata } from "next";

import { Trainer } from "@/components/study/trainer";

export const metadata: Metadata = {
  title: "Занятие",
  robots: { index: false, follow: false },
};

export default function TrainPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <Trainer />
    </main>
  );
}
