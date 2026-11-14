/**
 * page.tsx — пользовательское соглашение.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Пользовательское соглашение",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
      <h1 className="font-serif text-4xl font-semibold text-ink">Пользовательское соглашение</h1>
      <p className="mt-2 text-sm text-muted">
        Редакция от 14 ноября 2026 года. Оператор: {legal.operatorName}, ИНН{" "}
        {legal.operatorInn}. Контакт:{" "}
        <a className="text-primary underline underline-offset-2" href={`mailto:${legal.contactEmail}`}>
          {legal.contactEmail}
        </a>.
      </p>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted">
        <p>
          «Мнемослов» — локальный и веб-сервис для запоминания английских слов через
          ассоциации, изображения и интервальные повторения. Сервис предоставляется «как
          есть»; мы не гарантируем достижение конкретного уровня языка.
        </p>
        <p>
          Пользователь отвечает за сохранность пароля и действия в своём аккаунте. Запрещены
          попытки обхода авторизации, автоматизированные атаки, публикация незаконного
          контента, чужих персональных данных и нарушение прав третьих лиц.
        </p>
        <p>
          Контент, иллюстрации и программный код защищены законом. Запрещено копировать базу
          ассоциаций и изображения для перепродажи без разрешения правообладателя.
        </p>
        <p>
          Платные функции регулируются{" "}
          <Link href="/offer" className="text-primary underline underline-offset-2">Публичной офертой</Link>.
          Возвраты и автопродление описаны в оферте и требуют отдельного согласия пользователя.
        </p>
        <p>
          Обработка персональных данных — в соответствии с{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-2">Политикой обработки ПДн</Link> и{" "}
          <Link href="/consent-pd" className="text-primary underline underline-offset-2">Согласием на обработку ПДн</Link>.
          Использование cookie — в соответствии с{" "}
          <Link href="/cookies" className="text-primary underline underline-offset-2">Политикой cookie</Link>.
        </p>
      </div>
    </article>
  );
}
