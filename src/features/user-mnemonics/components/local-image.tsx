"use client";

/**
 * local-image.tsx — отображение изображения, сохранённого в IndexedDB.
 *
 * Blob читается по id ассоциации, показывается через object URL и освобождает
 * URL при смене варианта или размонтировании. Если записи нет, остаётся
 * текстовый плейсхолдер.
 */

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

import { getLocalImage } from "../image-local-store";

export type LocalImageProps = {
  mnemonicId: string;
  alt: string;
  className?: string;
};

type LoadedImage = {
  mnemonicId: string;
  url: string | null;
};

export function LocalImage({ mnemonicId, alt, className }: LocalImageProps) {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    getLocalImage(mnemonicId)
      .then((blob) => {
        if (!active) return;

        if (!blob) {
          setLoaded({ mnemonicId, url: null });
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setLoaded({ mnemonicId, url: objectUrl });
      })
      .catch(() => {
        if (active) setLoaded({ mnemonicId, url: null });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mnemonicId]);

  const current = loaded?.mnemonicId === mnemonicId ? loaded : null;

  if (current?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- object URL cannot be optimized by next/image
      <img
        src={current.url}
        alt={alt}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted",
        className,
      )}
    >
      <ImageOff className="size-5" aria-hidden="true" />
      <span>{current ? "Нет изображения" : "Загружаем изображение…"}</span>
    </div>
  );
}
