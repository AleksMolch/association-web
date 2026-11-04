/**
 * types.ts — общий контракт пользовательских ассоциаций.
 *
 * Имена типов, полей и строковых литералов должны совпадать в мобильном
 * приложении и веб-версии. Контракт описывает только текст: изображения
 * остаются локальными и не попадают в DTO отправки.
 */

/** Источник ассоциации, отображаемой в карточке. */
export type MnemonicSource = 'builtin' | 'user';

/** Личная пользовательская ассоциация без бинарного изображения. */
export type UserMnemonic = {
  id: string;
  userId?: string;
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
  locale: 'ru';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rev: number;
};

/** Локальная привязка изображения к пользовательской ассоциации. */
export type LocalMnemonicMedia = {
  mnemonicId: string;
  localUri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  byteSize: number;
  checksum: string;
  createdAt: string;
};

/** Состояние добровольного участия в улучшении сервиса. */
export type ContributionConsent =
  | 'unset'
  | 'granted'
  | 'declined'
  | 'ask_later'
  | 'withdrawn';

/** DTO отправки только текста в банк идей. */
export type MnemonicContributionInput = {
  clientContributionId: string;
  sourceMnemonicId: string;
  wordId: number;
  meaningId: string;
  cueWord: string;
  sceneText: string;
  locale: 'ru';
  consentVersion: string;
  submittedAt: string;
};

/** Текущая версия согласия на отправку вклада. */
export const CONSENT_VERSION = '1.0';
