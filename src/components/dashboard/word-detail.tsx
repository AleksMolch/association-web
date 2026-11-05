"use client";

/**
 * word-detail.tsx — карточка слова в кабинете.
 *
 * Показывает все ассоциации и позволяет выбрать или заменить ключ. Для нового
 * слова выбор создаёт FSRS-карточку; для изученного — меняет ассоциацию.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getWord, imageUrl, primaryMnemonic } from "@/content";
import {
  CONSENT_COPY,
  CONSENT_VERSION,
  type ConsentAction,
} from "@/features/contributions/consent";
import {
  applyConsentAction,
  applyPreferenceToSettings,
  reconcileConsentPreference,
  shouldPromptForSettings,
} from "@/features/contributions/consent-preferences";
import { ConsentDialog } from "@/features/contributions/components/consent-dialog";
import {
  getContributionPreference,
  putContributionPreference,
  type ContributionPreference,
} from "@/features/contributions/preference-client";
import type { UserMnemonic } from "@/features/user-mnemonics/types";
import { LocalImage } from "@/features/user-mnemonics/components/local-image";
import { MnemonicEditor } from "@/features/user-mnemonics/components/mnemonic-editor";
import { deleteLocalImage } from "@/features/user-mnemonics/image-local-store";
import { useSession } from "@/lib/auth-client";
import { formatNextReview, stateLabel } from "@/lib/fsrs";
import { useGuest } from "@/lib/guest-store";
import { speakEnglish } from "@/lib/speech";
import { cn } from "@/lib/utils";

type EditorState =
  | { kind: "create" }
  | { kind: "edit"; mnemonic: UserMnemonic }
  | null;

export function WordDetail({
  wordId,
  initialEditId = null,
}: {
  wordId: number;
  initialEditId?: string | null;
}) {
  const word = getWord(wordId);
  const {
    ready,
    settings,
    cardByWord,
    preferred,
    activeUserMnemonics,
    consentPromptShown,
    updateSettings,
    markConsentPromptShown,
    markUserMnemonicCreated,
    selectMnemonic,
    createUserMnemonic,
    updateUserMnemonic,
    deleteUserMnemonic,
    setLocalMediaMeta,
    deleteLocalMediaMeta,
  } = useGuest();
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const [manualEditor, setEditor] = useState<EditorState>(null);
  const [initialEditClosed, setInitialEditClosed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [consentDismissed, setConsentDismissed] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [preferenceUserId, setPreferenceUserId] = useState<string | null>(null);
  const [appliedServerPreference, setAppliedServerPreference] = useState<{
    userId: string;
    preference: ContributionPreference;
  } | null>(null);
  const settingsRef = useRef(settings);
  const consentActionVersionRef = useRef(0);
  const authenticated = Boolean(session?.user);
  const preferenceLoading =
    Boolean(sessionUserId) && preferenceUserId !== sessionUserId;
  const effectiveSettings =
    appliedServerPreference?.userId === sessionUserId
      ? applyPreferenceToSettings(
          settings,
          appliedServerPreference.preference,
        )
      : settings;
  const promptEligible =
    Boolean(word) &&
    !preferenceLoading &&
    !consentDismissed &&
    shouldPromptForSettings(effectiveSettings, {
      authenticated,
      shownThisSession: consentPromptShown,
      now: new Date(),
    });

  if (promptEligible && !consentOpen) {
    setConsentOpen(true);
  }

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!consentOpen) return;
    markConsentPromptShown();
  }, [consentOpen, markConsentPromptShown]);

  useEffect(() => {
    if (!sessionUserId) return;

    let active = true;

    getContributionPreference()
      .then((preference) => {
        if (!active) return;

        const local = settingsRef.current;

        if (
          reconcileConsentPreference(
            local.contributionConsent,
            preference.status,
          ) === "apply_server"
        ) {
          const applied = applyPreferenceToSettings(local, preference);
          settingsRef.current = applied;
          updateSettings({
            contributionConsent: applied.contributionConsent,
            contributionConsentVersion: applied.contributionConsentVersion,
            contributionNextPromptAt: applied.contributionNextPromptAt,
          });
          setAppliedServerPreference({
            userId: sessionUserId,
            preference,
          });
        }

        setPreferenceUserId(sessionUserId);
      })
      .catch(() => {
        if (!active) return;
        setPreferenceUserId(sessionUserId);
      });

    return () => {
      active = false;
    };
  }, [sessionUserId, updateSettings]);

  const initialMnemonic = initialEditId && !initialEditClosed
    ? activeUserMnemonics[initialEditId]
    : undefined;
  const editor: EditorState =
    manualEditor ??
    (initialMnemonic && initialMnemonic.wordId === wordId
      ? { kind: "edit", mnemonic: initialMnemonic }
      : null);

  const closeEditor = () => {
    setInitialEditClosed(true);
    setEditor(null);
  };

  function applyConsent(action: ConsentAction) {
    const version = consentActionVersionRef.current + 1;
    consentActionVersionRef.current = version;
    setConsentDismissed(true);
    setConsentOpen(false);
    setAppliedServerPreference(null);
    markConsentPromptShown();

    const next = applyConsentAction(settingsRef.current, action, new Date());
    settingsRef.current = next;
    updateSettings({
      contributionConsent: next.contributionConsent,
      contributionConsentVersion: next.contributionConsentVersion,
      contributionNextPromptAt: next.contributionNextPromptAt,
      contributionPromptAfterCount: next.contributionPromptAfterCount,
    });

    if (!authenticated) return;

    void putContributionPreference({
      status: next.contributionConsent,
      consentVersion: next.contributionConsentVersion ?? CONSENT_VERSION,
    })
      .then((saved) => {
        if (consentActionVersionRef.current !== version) return;
        const applied = applyPreferenceToSettings(settingsRef.current, saved);
        settingsRef.current = applied;
        updateSettings({
          contributionConsent: applied.contributionConsent,
          contributionConsentVersion: applied.contributionConsentVersion,
          contributionNextPromptAt: applied.contributionNextPromptAt,
        });
      })
      .catch(() => {
        toast.error(
          "Не удалось сохранить настройку на сервере. Решение сохранено на этом устройстве.",
        );
      });
  }

  if (!word) {
    return (
      <Card className="text-center">
        <h1 className="font-serif text-2xl font-semibold text-ink">Слово не найдено</h1>
        <Link href="/dashboard/words" className={buttonVariants({ className: "mt-4" })}>К списку слов</Link>
      </Card>
    );
  }

  if (!ready) return <p className="text-sm text-muted">Загружаем слово…</p>;

  const activeWord = word;
  const card = cardByWord.get(activeWord.id);
  const activeId = preferred.get(activeWord.id);
  const mode = card ? "replace" : "initial";
  const showRegistrationHint =
    !authenticated &&
    settings.userMnemonicCreatedCount >= 3 &&
    (settings.contributionConsent === "unset" ||
      settings.contributionConsent === "ask_later");
  const userVariants = Object.values(activeUserMnemonics)
    .filter((mnemonic) => mnemonic.wordId === activeWord.id)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );

  async function handleDelete(mnemonic: UserMnemonic) {
    const wasPreferred = activeId === mnemonic.id;
    const fallback = wasPreferred ? primaryMnemonic(activeWord) : null;

    setConfirmDeleteId(null);

    try {
      await deleteLocalImage(mnemonic.id);
    } catch {
      toast.error("Не удалось удалить изображение варианта");
      return;
    }

    deleteUserMnemonic(mnemonic.id);

    if (fallback) {
      selectMnemonic(activeWord.id, fallback.id, mode);
      toast.success(`Личный вариант удалён. Выбрана ассоциация «${fallback.cueWord}»`);
      return;
    }

    toast.success("Личный вариант удалён");
  }

  return (
    <div className="space-y-5">
      <Link href="/dashboard/words" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Все слова
      </Link>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-serif text-4xl font-semibold text-ink">{word.lemma}</h1>
            <span className="text-sm text-muted">{word.ipa}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Произнести ${word.lemma}`}
              onClick={() => speakEnglish(word.lemma, settings.ttsRate)}
            >
              <Volume2 className="size-5" />
            </Button>
          </div>
          <p className="text-lg text-ink">{word.meanings.join("; ")}</p>
          <p className="text-xs text-muted">Произношение: {word.ruPronunciation}</p>

          <div className="rounded-xl border border-line p-3 text-sm">
            {card ? (
              <div className="space-y-1">
                <p className="font-semibold text-ink">Карточка: {stateLabel(card.state)}</p>
                <p className="text-muted">
                  Следующий повтор: {formatNextReview(card.due)} · повторов: {card.reps} · срывов: {card.lapses}
                </p>
              </div>
            ) : (
              <p className="text-muted">
                Слово ещё не изучается. Выбор ассоциации создаст карточку и добавит слово в занятия.
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <CardHeader>
            <CardTitle className="text-lg">Быстрые действия</CardTitle>
            <CardDescription>Ассоциацию можно менять в любое время.</CardDescription>
          </CardHeader>
          <Link href="/train" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
            Перейти к занятию
          </Link>
          <p className="text-xs leading-relaxed text-muted">
            При замене ключа карточка сохраняет историю повторений. Новый ключ
            начнёт использоваться со следующего показа.
          </p>
        </Card>
      </div>

      <section aria-labelledby="associations-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="associations-heading" className="font-serif text-2xl font-semibold text-ink">Ассоциации</h2>
            <p className="text-sm text-muted">Выберите ключ, который понятнее лично вам.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{word.mnemonics.length + userVariants.length} вариант(а/ов)</Badge>
            <Button variant="secondary" size="sm" onClick={() => setEditor({ kind: "create" })}>
              + Добавить свой вариант
            </Button>
          </div>
        </div>

        {editor && (
          <MnemonicEditor
            key={editor.kind === "edit" ? editor.mnemonic.id : "new"}
            wordId={word.id}
            meaningId="0"
            mnemonic={editor.kind === "edit" ? editor.mnemonic : null}
            createUserMnemonic={createUserMnemonic}
            updateUserMnemonic={updateUserMnemonic}
            setLocalMediaMeta={setLocalMediaMeta}
            deleteLocalMediaMeta={deleteLocalMediaMeta}
            onCancel={closeEditor}
            onCreated={markUserMnemonicCreated}
            onSaved={() => {
              setMediaVersion((version) => version + 1);
              closeEditor();
            }}
          />
        )}

        {userVariants.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted">Мои варианты</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {userVariants.map((mnemonic) => {
                const active = activeId === mnemonic.id;
                return (
                  <Card
                    key={mnemonic.id}
                    className={cn("overflow-hidden", active && "border-primary ring-2 ring-primary/20")}
                  >
                    <div className="relative aspect-[4/3] bg-paper-warm">
                      <LocalImage
                        mnemonicId={mnemonic.id}
                        alt={`Личная иллюстрация: ${mnemonic.sceneText}`}
                        refreshKey={mediaVersion}
                        onAddImage={() => setEditor({ kind: "edit", mnemonic })}
                      />
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="primary">Мой</Badge>
                        <Badge variant="coral">Ключ: {mnemonic.cueWord}</Badge>
                      </div>
                      <p className="text-sm leading-relaxed text-ink">{mnemonic.sceneText}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={active ? "secondary" : "primary"}
                          disabled={active}
                          aria-label={
                            active
                              ? `Вариант «${mnemonic.cueWord}» выбран`
                              : `Выбрать вариант «${mnemonic.cueWord}»`
                          }
                          onClick={() => {
                            const selected = selectMnemonic(word.id, mnemonic.id, mode);
                            if (selected) {
                              toast.success(
                                mode === "initial"
                                  ? `Слово «${word.lemma}» добавлено в занятия`
                                  : `Ассоциация для «${word.lemma}» заменена`,
                              );
                            }
                          }}
                        >
                          {active ? <><Check className="size-4" /> Выбрана</> : "Выбрать"}
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`Изменить вариант «${mnemonic.cueWord}»`}
                          onClick={() => setEditor({ kind: "edit", mnemonic })}
                        >
                          Изменить
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Удалить вариант «${mnemonic.cueWord}»`}
                          onClick={() => setConfirmDeleteId(mnemonic.id)}
                        >
                          Удалить
                        </Button>
                      </div>

                      {confirmDeleteId === mnemonic.id && (
                        <div
                          role="group"
                          aria-labelledby={`delete-warning-${mnemonic.id}`}
                          className="rounded-xl border border-coral/40 bg-coral-soft p-3 text-sm"
                        >
                          <p id={`delete-warning-${mnemonic.id}`} className="font-semibold text-ink">
                            Удалить личный вариант?
                          </p>
                          <p className="mt-1 text-muted">
                            Изображение и текст будут удалены без возможности восстановления.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button variant="coral" size="sm" onClick={() => void handleDelete(mnemonic)}>
                              Да, удалить
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>
                              Отмена
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
            <Separator />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {word.mnemonics.map((mnemonic) => {
            const active = activeId === mnemonic.id;
            return (
              <Card
                key={mnemonic.id}
                className={cn("overflow-hidden", active && "border-primary ring-2 ring-primary/20")}
              >
                <div className="relative aspect-[4/3] bg-paper-warm">
                  <Image
                    src={imageUrl(mnemonic.image)}
                    alt={`Иллюстрация: ${mnemonic.sceneText}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 420px"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="coral">Ключ: {mnemonic.cueWord}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-ink">{mnemonic.sceneText}</p>
                  <Button
                    variant={active ? "secondary" : "primary"}
                    disabled={active}
                    onClick={() => {
                      selectMnemonic(word.id, mnemonic.id, mode);
                      toast.success(
                        mode === "initial"
                          ? `Слово «${word.lemma}» добавлено в занятия`
                          : `Ассоциация для «${word.lemma}» заменена`,
                      );
                    }}
                  >
                    {active ? <><Check className="size-4" /> Выбрана</> : mode === "initial" ? "Выбрать и добавить" : "Заменить на эту"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {showRegistrationHint && (
        <Card className="space-y-3">
          <CardHeader>
            <CardTitle className="text-lg">
              {CONSENT_COPY.registrationHintTitle}
            </CardTitle>
            <CardDescription>
              {CONSENT_COPY.registrationHintBody}
            </CardDescription>
          </CardHeader>
          <Link
            href="/login"
            className={buttonVariants({
              variant: "secondary",
              className: "w-fit",
            })}
          >
            Войти
          </Link>
        </Card>
      )}

      {consentOpen ? (
        <ConsentDialog open onAction={applyConsent} />
      ) : null}
    </div>
  );
}
