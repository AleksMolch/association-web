/**
 * preference-client.ts — клиент настройки согласия на отправку вкладов.
 *
 * GET и PUT работают только с владельцем сессии. Ответ проверяется по форме,
 * чтобы повреждённый JSON не попадал в локальные настройки.
 */

import { CONSENT_VERSION } from "@/features/contributions/consent";
import type { ContributionConsent } from "@/features/user-mnemonics/types";

/** Публичная настройка согласия, возвращаемая API. */
export type ContributionPreference = {
  status: ContributionConsent;
  consentVersion: string | null;
  decidedAt: string | null;
  nextPromptAt: string | null;
};

/** Входные данные PUT: только статус и версия согласия. */
export type ContributionPreferenceInput = {
  status: ContributionConsent;
  consentVersion: string;
};

const ENDPOINT = "/api/privacy/contribution-preference";
const STATUSES = new Set<ContributionConsent>([
  "unset",
  "granted",
  "declined",
  "ask_later",
  "withdrawn",
]);

/** Ошибка клиента настройки с HTTP-статусом, если он известен. */
export class ContributionPreferenceError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ContributionPreferenceError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parsePreference(value: unknown): ContributionPreference {
  if (!isRecord(value) || !STATUSES.has(value.status as ContributionConsent)) {
    throw new ContributionPreferenceError(
      "Сервер вернул некорректную настройку согласия.",
    );
  }

  return {
    status: value.status as ContributionConsent,
    consentVersion: nullableString(value.consentVersion),
    decidedAt: nullableString(value.decidedAt),
    nextPromptAt: nullableString(value.nextPromptAt),
  };
}

async function readResponse(response: Response): Promise<ContributionPreference> {
  if (response.status === 401) {
    throw new ContributionPreferenceError(
      "Сессия истекла. Войдите снова.",
      401,
    );
  }

  if (!response.ok) {
    throw new ContributionPreferenceError(
      "Не удалось сохранить настройку согласия.",
      response.status,
    );
  }

  return parsePreference(await response.json().catch(() => null));
}

/** Загружает настройку текущего пользователя. */
export async function getContributionPreference(): Promise<ContributionPreference> {
  let response: Response;

  try {
    response = await fetch(ENDPOINT, { method: "GET", cache: "no-store" });
  } catch {
    throw new ContributionPreferenceError(
      "Не удалось связаться с сервером.",
    );
  }

  return readResponse(response);
}

/** Сохраняет решение текущего пользователя и возвращает ответ сервера. */
export async function putContributionPreference(
  input: ContributionPreferenceInput,
): Promise<ContributionPreference> {
  let response: Response;

  try {
    response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: input.status,
        consentVersion: input.consentVersion || CONSENT_VERSION,
      }),
    });
  } catch {
    throw new ContributionPreferenceError(
      "Не удалось связаться с сервером.",
    );
  }

  return readResponse(response);
}
