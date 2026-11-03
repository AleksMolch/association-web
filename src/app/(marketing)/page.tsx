/**
 * page.tsx — публичный лендинг Association.
 *
 * SEO-страница объясняет метод, показывает реальную ассоциацию, тарифы и
 * ведёт в демо без регистрации. Все иллюстрации — локальные ассеты проекта.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Brain, Check, Sparkles } from "lucide-react";

import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { content, getWord, imageUrl, primaryMnemonic } from "@/content";
import { plans, formatRub } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Association — английские слова через ассоциации",
  description:
    "Запоминайте английские слова через русские созвучные ассоциации и книжные иллюстрации. Демо без регистрации, бесплатный тренажёр, FSRS.",
  alternates: { canonical: "/" },
};

const faq = [
  {
    q: "Это очередное приложение с карточками?",
    a: "Карточки — только механика повторения. Главное здесь — русская созвучная ассоциация и иллюстрация, которые связывают звучание английского слова с его значением.",
  },
  {
    q: "Можно попробовать без регистрации?",
    a: "Да. Нажмите «Попробовать», пройдите три демонстрационные карточки и только потом решите, сохранять ли прогресс.",
  },
  {
    q: "Что такое FSRS?",
    a: "Free Spaced Repetition Scheduler — алгоритм интервального повторения. Он подбирает следующий показ карточки по вашей оценке ответа, а не по фиксированному расписанию.",
  },
  {
    q: "Чем VIP отличается от бесплатного доступа?",
    a: "Бесплатно доступны веб-тренажёр, выбранные ассоциации и базовая статистика. VIP убирает рекламу, включает синхронизацию с мобильным приложением, расширенную статистику и экспорт.",
  },
  {
    q: "Гарантирует ли метод знание языка?",
    a: "Нет. Это мнемоническая опора для запоминания слов, а не замена практике речи, чтению и грамматике. Эффективность зависит от регулярности и вашей работы с языком.",
  },
];

const methods = [
  {
    icon: Brain,
    title: "Созвучие",
    text: "Английское слово цепляется за знакомое русское слово: bright — «Брат».",
  },
  {
    icon: Sparkles,
    title: "Сцена",
    text: "Ассоциация превращается в короткую книжную сцену, которую легко представить.",
  },
  {
    icon: BookOpen,
    title: "Повторение",
    text: "FSRS возвращает карточку в нужный момент, а вы выбираете Again, Hard, Good или Easy.",
  },
];

export default function HomePage() {
  const featured = getWord(1) ?? content.words[0];
  const featuredMnemonic = primaryMnemonic(featured);
  const exampleWord = getWord(3) ?? content.words[2];
  const exampleMnemonic = exampleWord.mnemonics.find((m) => m.cueWord === "Дети") ?? exampleWord.mnemonics[0];
  const totalMnemonics = content.words.reduce((sum, word) => sum + word.mnemonics.length, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Association",
        url: process.env.NEXT_PUBLIC_APP_URL ?? "https://association.example",
        description:
          "Тренажёр английских слов через русские созвучные ассоциации, книжные иллюстрации и FSRS.",
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>

      <section className="border-b border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div className="space-y-7">
            <Badge variant="primary">Метод ключевых слов + FSRS</Badge>
            <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Английские слова, которые остаются в памяти
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              Русское созвучие, живая книжная иллюстрация и интервальное повторение.
              Не зубрёжка, а понятная связка между звучанием и значением.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants({ size: "lg" })}>
                Попробовать 3 карточки <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/register" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Начать бесплатно
              </Link>
            </div>
            <dl className="grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                ["Слов", String(content.words.length)],
                ["Ассоциаций", String(totalMnemonics)],
                ["Иллюстраций", "2 664"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="font-serif text-2xl font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[4/3] bg-paper-warm">
              <Image
                src={imageUrl(featuredMnemonic.image)}
                alt={`Иллюстрация к слову ${featured.lemma}: ${featuredMnemonic.sceneText}`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-cover"
              />
            </div>
            <div className="space-y-2 p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-serif text-3xl font-semibold text-ink">{featured.lemma}</span>
                <span className="text-sm text-muted">{featured.ipa}</span>
                <span className="text-sm text-muted">{featured.meanings[0]}</span>
              </div>
              <Badge variant="coral">Ключ: {featuredMnemonic.cueWord}</Badge>
              <p className="text-sm leading-relaxed text-ink">{featuredMnemonic.sceneText}</p>
            </div>
          </Card>
        </div>
      </section>

      <section id="method" className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <div className="mb-9 max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Как это работает</p>
            <h2 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Три звена одной связки</h2>
            <p className="text-base leading-relaxed text-muted">
              Метод не обещает «выучить язык за неделю». Он даёт опору для конкретного слова,
              которую затем закрепляет интервальное повторение.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {methods.map((item, index) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <CardTitle>{index + 1}. {item.title}</CardTitle>
                    <CardDescription>{item.text}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-paper-warm/60">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Пример</p>
            <h2 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Не перевод, а крючок</h2>
            <p className="text-base leading-relaxed text-muted">
              Слово <strong className="text-ink">bright</strong> звучит как «брат». На картинке брат
              светится, как лампа. Значение «яркий» появляется из действия, а не из подписи.
            </p>
            <div className="rounded-2xl border border-line bg-surface p-5">
              <p className="font-serif text-2xl font-semibold text-ink">{exampleWord.lemma}</p>
              <p className="text-sm text-muted">{exampleWord.meanings[0]} · ключ «{exampleMnemonic.cueWord}»</p>
              <Separator className="my-3" />
              <p className="text-sm leading-relaxed text-ink">{exampleMnemonic.sceneText}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[featuredMnemonic, exampleMnemonic].map((mnemonic, index) => (
              <Card key={mnemonic.id} className="overflow-hidden p-0">
                <div className="relative aspect-[4/3] bg-paper">
                  <Image
                    src={imageUrl(mnemonic.image)}
                    alt={`Ассоциация: ${mnemonic.sceneText}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 280px"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-1 p-4">
                  <Badge variant={index === 0 ? "coral" : "primary"}>Ключ: {mnemonic.cueWord}</Badge>
                  <p className="text-sm leading-relaxed text-ink">{mnemonic.sceneText}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="science" className="border-b border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Наука</p>
            <h2 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Что здесь действительно проверено</h2>
          </div>
          <div className="space-y-4 text-base leading-relaxed text-muted">
            <p>
              Метод ключевых слов описан в исследовании Raugh и Atkinson (1974) как мнемонический
              приём для запоминания иноязычной лексики. Он опирается на два звена: созвучие слова
              с ключом и мысленный образ, связывающий ключ с переводом.
            </p>
            <p>
              FSRS — инженерный алгоритм планирования повторений. Мы используем его как инструмент,
              а не как доказательство эффективности конкретной картинки.
            </p>
            <p className="rounded-xl border border-line bg-paper-warm p-4 text-sm">
              Важное ограничение: ассоциация субъективна. Если связка не работает лично для вас,
              выберите другую или добавьте собственный вариант. Приложение не заменяет практику
              речи, чтения и грамматики.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-surface/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <div className="mb-8 max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Почему это работает</p>
            <h2 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Опора, повторение, ясность</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Один фокус", "В кадре одно действие: ключ взаимодействует со значением."],
              ["Ваши варианты", "Выбирайте из готовых связок или добавляйте свою."],
              ["Без сети", "Тренажёр работает локально; облако — для сохранения и VIP-синхронизации."],
              ["Без давления", "Никаких штрафов и обязательных ежедневных серий."],
            ].map(([title, text]) => (
              <Card key={title}>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="mt-1">{text}</CardDescription>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Тарифы</p>
              <h2 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Бесплатно для практики, VIP для синхронизации</h2>
            </div>
            <Link href="/pricing" className={buttonVariants({ variant: "secondary" })}>Все тарифы</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.code} className={plan.highlight ? "border-primary" : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{plan.title}</CardTitle>
                    {plan.highlight ? <Badge variant="primary">Выбор</Badge> : null}
                  </div>
                  <p className="font-serif text-3xl font-semibold text-ink">{formatRub(plan.amountMinor)}</p>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <ul className="space-y-1.5 text-sm text-muted">
                  {["Без рекламы", "Синхронизация с мобильным", "Расширенная статистика", "Экспорт"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="size-4 text-success" aria-hidden="true" /> {item}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Цены указаны для примера. Перед публикацией их нужно синхронизировать с офертой и
            настройками ЮKassa.
          </p>
        </div>
      </section>

      <section id="faq" className="border-b border-line bg-paper-warm/60">
        <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8">
          <div className="mb-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Вопросы</p>
            <h2 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Коротко о главном</h2>
          </div>
          <Accordion>
            {faq.map((item) => (
              <AccordionItem key={item.q} title={item.q}>
                {item.a}
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section>
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-5 py-16 text-center sm:px-8">
          <h2 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Попробуйте на трёх словах</h2>
          <p className="max-w-xl text-base leading-relaxed text-muted">
            Без регистрации и почты. Если связка сработает — сохраните прогресс и продолжайте
            в удобном темпе.
          </p>
          <Link href="/demo" className={buttonVariants({ size: "lg" })}>
            Открыть демо <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
