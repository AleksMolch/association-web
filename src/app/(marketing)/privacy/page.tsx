/**
 * page.tsx — политика обработки персональных данных (шаблон).
 *
 * Текст является техническим шаблоном, а не юридической консультацией.
 * Перед публикацией необходимо заполнить реквизиты оператора и проверить
 * документ у юриста.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Политика обработки персональных данных",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
      <p className="mb-3 rounded-xl border border-coral/40 bg-coral-soft p-4 text-sm text-coral">
        Шаблон. Перед публикацией заполните реквизиты оператора, проверьте документ
        у юриста и опубликуйте уведомление в Роскомнадзоре, если оно требуется.
      </p>
      <h1 className="font-serif text-4xl font-semibold text-ink">
        Политика обработки персональных данных
      </h1>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="font-serif text-xl font-semibold text-ink">1. Оператор</h2>
          <p>Оператор: [наименование / ИП], ИНН [ ], адрес [ ], email [ ].</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold text-ink">2. Какие данные обрабатываются</h2>
          <p>
            Email, хеш пароля, имя (необязательное отображаемое имя), выбранные ассоциации,
            прогресс FSRS, история повторений, идентификаторы платежей ЮKassa. Данные банковской
            карты не хранятся на стороне Association.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold text-ink">3. Цели и основания</h2>
          <p>
            Регистрация и вход, сохранение прогресса, синхронизация, оплата VIP, поддержка,
            безопасность и предотвращение злоупотреблений. Основания: согласие пользователя,
            исполнение договора, законные интересы безопасности.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold text-ink">4. Сроки и права</h2>
          <p>
            Данные хранятся до удаления аккаунта или до истечения сроков, установленных законом.
            Пользователь может запросить доступ, исправление, экспорт и удаление данных через
            [email поддержки].
          </p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold text-ink">5. Cookies и аналитика</h2>
          <p>
            Обязательные cookies нужны для сессии. Необязательная аналитика и реклама подключаются
            только после согласия, если это требуется законом.
          </p>
        </section>
      </div>
    </article>
  );
}
