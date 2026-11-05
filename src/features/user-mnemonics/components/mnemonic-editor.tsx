"use client";

/**
 * mnemonic-editor.tsx — форма личной ассоциации.
 *
 * Текст проверяется общей схемой, изображение обрабатывается и складывается
 * в IndexedDB. Старый Blob заменяется тем же ключом, а удаление изображения
 * очищает и Blob, и локальные метаданные.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import type { LocalMnemonicMedia, UserMnemonic } from "@/features/user-mnemonics/types";
import type {
  CreateUserMnemonicInput,
  UpdateUserMnemonicPatch,
} from "@/lib/guest-store";
import { toast } from "sonner";

import {
  deleteLocalImage,
  getLocalImage,
  putLocalImage,
  requestPersistentStorage,
} from "../image-local-store";
import { userMnemonicInputSchema } from "../schemas";
import { LocalImage } from "./local-image";

export type MnemonicEditorProps = {
  wordId: number;
  meaningId: string;
  mnemonic?: UserMnemonic | null;
  createUserMnemonic: (input: CreateUserMnemonicInput) => UserMnemonic;
  updateUserMnemonic: (
    id: string,
    patch: UpdateUserMnemonicPatch,
  ) => UserMnemonic | null;
  setLocalMediaMeta: (media: LocalMnemonicMedia) => void;
  deleteLocalMediaMeta: (mnemonicId: string) => void;
  onCancel: () => void;
  onSaved?: (mnemonic: UserMnemonic) => void;
  onCreated?: (mnemonic: UserMnemonic) => void;
};

type FieldErrors = {
  cueWord?: string;
  sceneText?: string;
};

export function MnemonicEditor({
  wordId,
  meaningId,
  mnemonic = null,
  createUserMnemonic,
  updateUserMnemonic,
  setLocalMediaMeta,
  deleteLocalMediaMeta,
  onCancel,
  onSaved,
  onCreated,
}: MnemonicEditorProps) {
  const [cueWord, setCueWord] = useState(mnemonic?.cueWord ?? "");
  const [sceneText, setSceneText] = useState(mnemonic?.sceneText ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageState, setImageState] = useState<{
    mnemonicId: string;
    exists: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mnemonicId = mnemonic?.id ?? null;

  useEffect(() => {
    let active = true;

    if (!mnemonicId) return;

    getLocalImage(mnemonicId)
      .then((blob) => {
        if (active) setImageState({ mnemonicId, exists: blob !== null });
      })
      .catch(() => {
        if (active) setImageState({ mnemonicId, exists: false });
      });

    return () => {
      active = false;
    };
  }, [mnemonicId]);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
    };
  }, []);

  function clearPreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }

    setPreviewUrl(null);
    setPendingFile(null);
  }

  function handleFileChange(file: File | undefined) {
    if (!file) return;

    clearPreview();

    const objectUrl = URL.createObjectURL(file);
    previewRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setPendingFile(file);
    setRemoveImage(false);
    void requestPersistentStorage();
  }

  function handleRemoveImage() {
    clearPreview();
    setRemoveImage(true);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function applyImageChanges(id: string): Promise<boolean> {
    if (pendingFile) {
      try {
        const media = await putLocalImage(id, pendingFile);
        setLocalMediaMeta(media);
        return true;
      } catch {
        return false;
      }
    }

    if (removeImage) {
      try {
        await deleteLocalImage(id);
        deleteLocalMediaMeta(id);
        return true;
      } catch {
        return false;
      }
    }

    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    const parsed = userMnemonicInputSchema.safeParse({
      cueWord,
      sceneText,
      meaningId,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};

      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "cueWord" && !nextErrors.cueWord) {
          nextErrors.cueWord = "Созвучие должно быть от 1 до 80 символов.";
        }
        if (issue.path[0] === "sceneText" && !nextErrors.sceneText) {
          nextErrors.sceneText = "Сцена должна быть от 5 до 500 символов.";
        }
      }

      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      let saved: UserMnemonic;

      if (mnemonic) {
        const updated = updateUserMnemonic(mnemonic.id, {
          cueWord: parsed.data.cueWord,
          sceneText: parsed.data.sceneText,
        });

        if (!updated) {
          toast.error("Вариант больше не существует");
          return;
        }

        saved = updated;
      } else {
        saved = createUserMnemonic({
          wordId,
          meaningId,
          cueWord: parsed.data.cueWord,
          sceneText: parsed.data.sceneText,
        });
      }

      const imageSaved = await applyImageChanges(saved.id);
      clearPreview();

      if (!imageSaved) {
        toast.error(
          "Текст сохранён, но изображение не удалось сохранить. Попробуйте ещё раз.",
        );
        onSaved?.(saved);
        return;
      }

      if (!mnemonic) onCreated?.(saved);

      toast.success(
        mnemonic ? "Личный вариант обновлён" : "Личный вариант добавлен",
      );
      onSaved?.(saved);
    } catch (error) {
      toast.error(messageForError(error, "Не удалось сохранить вариант"));
    } finally {
      setSaving(false);
    }
  }

  const hasExistingImage =
    mnemonicId !== null &&
    imageState?.mnemonicId === mnemonicId &&
    imageState.exists;
  const showExistingImage =
    hasExistingImage && !removeImage && !pendingFile;
  const showRemoveImageButton =
    Boolean(pendingFile) || (hasExistingImage && !removeImage);

  return (
    <Card className="space-y-3">
      <CardHeader>
        <CardTitle className="text-lg">
          {mnemonic ? "Редактировать личный вариант" : "Новый личный вариант"}
        </CardTitle>
        <CardDescription>
          Созвучие и сцена видны только вам и хранятся на этом устройстве.
        </CardDescription>
      </CardHeader>

      <form className="space-y-3" onSubmit={handleSubmit} noValidate>
        <div className="space-y-1">
          <Label htmlFor="mnemonic-cue">Созвучие</Label>
          <Input
            id="mnemonic-cue"
            value={cueWord}
            aria-invalid={Boolean(errors.cueWord)}
            onChange={(event) => setCueWord(event.target.value)}
          />
          <FieldError>{errors.cueWord}</FieldError>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mnemonic-scene">Сцена</Label>
          <Textarea
            id="mnemonic-scene"
            value={sceneText}
            aria-invalid={Boolean(errors.sceneText)}
            onChange={(event) => setSceneText(event.target.value)}
          />
          <FieldError>{errors.sceneText}</FieldError>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mnemonic-image">Изображение (необязательно)</Label>
          <Input
            ref={fileInputRef}
            id="mnemonic-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => handleFileChange(event.target.files?.[0])}
          />
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-paper-warm">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img
              src={previewUrl}
              alt="Предпросмотр изображения"
              className="h-full w-full object-cover"
            />
          ) : showExistingImage && mnemonicId ? (
            <LocalImage
              mnemonicId={mnemonicId}
              alt="Текущее изображение варианта"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              Без изображения
            </div>
          )}
        </div>

        {showRemoveImageButton && (
          <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage}>
            Удалить фото
          </Button>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Отмена
          </Button>
        </div>
      </form>
    </Card>
  );
}

function messageForError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
