import {
  CONSENT_VERSION,
  type ContributionConsent,
} from "@/features/user-mnemonics/types";

export { CONSENT_VERSION };

export type ConsentAction = "grant" | "decline" | "ask_later" | "withdraw";

export type ConsentContext = {
  now: Date;
  createdCount: number;
};

export type ConsentDecision = {
  status: ContributionConsent;
  consentVersion: string;
  nextPromptAt: string | null;
  promptAfterCount: number | null;
};

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

export const CONSENT_COPY = {
  title: "Поможете улучшить Association?",
  body: "Вы создали несколько собственных ассоциаций. Если хотите, вы можете добровольно делиться их текстом с командой сервиса. Мы будем использовать варианты для отбора и создания лучших общих ассоциаций. Картинки, имена файлов и данные изображения не передаются. Настройку можно изменить в любое время.",
  grantButton: "Да, делиться текстом",
  declineButton: "Не сейчас",
  detailLink: "Подробнее",
  settingsTitle: "Делиться текстом моих ассоциаций",
  settingsDescription:
    "Передаются только созвучие и описание сцены вместе с идентификатором слова. Картинки, имена файлов и данные изображения не передаются.",
} as const;

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
  if (nextPromptAt === null || promptAfterCount === null) return false;

  const nextPromptMs = Date.parse(nextPromptAt);
  if (!Number.isFinite(nextPromptMs)) return false;

  return now.getTime() >= nextPromptMs && createdCount >= promptAfterCount;
}
