/**
 * consent.ts — автомат согласия на передачу текста ассоциаций.
 *
 * Содержит чистые переходы состояний, условие показа диалога и точные
 * тексты согласия из спецификации §9.2–9.3. Модуль не зависит от UI и
 * хранилища: текущее время и число созданных ассоциаций передаются явно.
 */

import {
  CONSENT_VERSION,
  type ContributionConsent,
} from "@/features/user-mnemonics/types";

/** Текущая версия согласия из общего контракта пользовательских ассоциаций. */
export { CONSENT_VERSION };

/** Действие пользователя в диалоге согласия или настройках. */
export type ConsentAction = "grant" | "decline" | "ask_later" | "withdraw";

/** Контекст перехода: текущее время и число созданных ассоциаций. */
export type ConsentContext = {
  now: Date;
  createdCount: number;
};

/** Решение автомата: новое состояние и связанные поля настроек. */
export type ConsentDecision = {
  status: ContributionConsent;
  consentVersion: string;
  nextPromptAt: string | null;
  promptAfterCount: number | null;
};

/** Данные для решения о показе диалога согласия. */
export type PromptContext = {
  createdCount: number;
  status: ContributionConsent;
  authenticated: boolean;
  shownThisSession: boolean;
  now: Date;
  nextPromptAt: string | null;
  promptAfterCount: number | null;
};

const PROMPT_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const PROMPT_AFTER_NEW_CREATIONS = 3;
const MIN_CREATED_COUNT = 3;

const STATUS_FOR_ACTION: Record<ConsentAction, ContributionConsent> = {
  grant: "granted",
  decline: "declined",
  ask_later: "ask_later",
  withdraw: "withdrawn",
};

/** Точные тексты диалога и переключателя настроек из спецификации §9.2–9.3. */
export const CONSENT_COPY = {
  title: "Поможете улучшить Association?",
  body: "Вы создали несколько собственных ассоциаций. Если хотите, вы можете добровольно делиться их текстом с командой сервиса. Мы будем использовать варианты для отбора и создания лучших общих ассоциаций. Картинки, имена файлов и данные изображения не передаются. Настройку можно изменить в любое время.",
  grantButton: "Да, делиться текстом",
  declineButton: "Не сейчас",
  detailLink: "Подробнее",
  settingsTitle: "Делиться текстом моих ассоциаций",
  settingsDescription:
    "Передаются только созвучие и описание сцены вместе с идентификатором слова. Изображения не передаются.",
  detailTitle: "Что передаётся",
  detailBody:
    "Передаются только созвучие и описание сцены вместе с идентификатором слова. Картинки, имена файлов и данные изображения не передаются. Участие добровольное: новые варианты отправляются только при включённой настройке, а согласие можно отозвать в любое время.",
  detailDeclineButton: "Больше не предлагать",
  registrationHintTitle: "Помогите улучшить Association",
  registrationHintBody:
    "Войдите в аккаунт, чтобы добровольно делиться текстом своих ассоциаций. Картинки, имена файлов и данные изображения не передаются.",
} as const;

/**
 * Вычисляет новое состояние согласия по действию пользователя.
 *
 * `ask_later` откладывает повторный показ на 30 дней и требует ещё три
 * создания; остальные действия сбрасывают таймеры. Текущее состояние
 * принимается для совместимости интерфейса автомата.
 */
export function nextConsentState(
  current: ContributionConsent,
  action: ConsentAction,
  { now, createdCount }: ConsentContext,
): ConsentDecision {
  if (action === "ask_later") {
    return {
      status: STATUS_FOR_ACTION.ask_later,
      consentVersion: CONSENT_VERSION,
      nextPromptAt: new Date(now.getTime() + PROMPT_DELAY_MS).toISOString(),
      promptAfterCount: createdCount + PROMPT_AFTER_NEW_CREATIONS,
    };
  }

  return {
    status: STATUS_FOR_ACTION[action],
    consentVersion: CONSENT_VERSION,
    nextPromptAt: null,
    promptAfterCount: null,
  };
}

/**
 * Решает, нужно ли показать диалог согласия.
 *
 * Показ возможен только авторизованному пользователю, которому диалог ещё
 * не показывали в этой сессии, после третьей созданной ассоциации. Для
 * `ask_later` дополнительно должны пройти 30 дней и порог числа созданий.
 *
 * Серверная настройка хранит только `nextPromptAt` и не знает локальный
 * счётчик. Поэтому `promptAfterCount === null` означает «только дата»:
 * диалог показывается после `nextPromptAt`, а не блокируется навсегда.
 */
export function shouldPrompt({
  createdCount,
  status,
  authenticated,
  shownThisSession,
  now,
  nextPromptAt,
  promptAfterCount,
}: PromptContext): boolean {
  if (!authenticated || shownThisSession) return false;
  if (createdCount < MIN_CREATED_COUNT) return false;
  if (status === "unset") return true;
  if (status !== "ask_later") return false;
  if (nextPromptAt === null) return false;

  const nextPromptMs = Date.parse(nextPromptAt);
  if (!Number.isFinite(nextPromptMs)) return false;
  if (now.getTime() < nextPromptMs) return false;
  if (promptAfterCount === null) return true;

  return createdCount >= promptAfterCount;
}
