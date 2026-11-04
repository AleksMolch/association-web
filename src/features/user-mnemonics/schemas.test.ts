/**
 * schemas.test.ts — проверки контракта пользовательских ассоциаций.
 *
 * Покрывает строгие Zod-схемы, нормализацию текста и побайтовый паритет
 * фикстур с мобильным приложением.
 */

import { describe, expect, it } from "vitest";

import fixtures from "@/features/user-mnemonics/contract.fixtures.json";
import {
  CONSENT_VERSION,
  contributionHash,
  contributionInputSchema,
  contributionPreferenceSchema,
  normalizeText,
  sha256Hex,
  userMnemonicInputSchema,
} from "@/features/user-mnemonics/schemas";

const validMnemonic = {
  cueWord: "Брат",
  sceneText: "Брат похож на брата",
  meaningId: "meaning-1",
};

const validContribution = {
  clientContributionId: "00000000-0000-4000-8000-000000000001",
  sourceMnemonicId: "00000000-0000-4000-8000-000000000002",
  wordId: 42,
  meaningId: "meaning-1",
  cueWord: "Брат",
  sceneText: "Брат похож на брата",
  locale: "ru" as const,
  consentVersion: CONSENT_VERSION,
  submittedAt: "2026-11-04T09:00:00.000Z",
};

describe("userMnemonicInputSchema", () => {
  it("принимает все валидные фикстуры", () => {
    expect(fixtures.valid.length).toBeGreaterThanOrEqual(3);

    for (const fixture of fixtures.valid) {
      expect(userMnemonicInputSchema.safeParse(fixture.input).success).toBe(true);
    }
  });

  it.each(["image", "uri", "fileName", "base64"])(
    "отклоняет лишнее поле %s",
    (extraKey) => {
      const result = userMnemonicInputSchema.safeParse({
        ...validMnemonic,
        [extraKey]: "local-photo.jpg",
      });

      expect(result.success).toBe(false);
    },
  );

  it("отклоняет созвучие длиннее 80 символов", () => {
    const result = userMnemonicInputSchema.safeParse({
      ...validMnemonic,
      cueWord: "а".repeat(81),
    });

    expect(result.success).toBe(false);
  });

  it("отклоняет описание сцены короче 5 символов", () => {
    const result = userMnemonicInputSchema.safeParse({
      ...validMnemonic,
      sceneText: "тест",
    });

    expect(result.success).toBe(false);
  });

  it("принимает граничные длины полей", () => {
    expect(
      userMnemonicInputSchema.safeParse({
        ...validMnemonic,
        cueWord: "а".repeat(80),
        sceneText: "а".repeat(500),
        meaningId: "m".repeat(32),
      }).success,
    ).toBe(true);
  });

  it("отклоняет все невалидные фикстуры, включая лишнее поле image", () => {
    expect(fixtures.invalid.length).toBeGreaterThanOrEqual(5);

    for (const fixture of fixtures.invalid) {
      expect(
        userMnemonicInputSchema.safeParse(fixture.input).success,
      ).toBe(false);
    }
  });

  it("пропускает HTML без изменений: экранирование — задача слоя рендера", () => {
    const sceneText = "Брат <script>alert(1)</script>";
    const result = userMnemonicInputSchema.safeParse({
      ...validMnemonic,
      sceneText,
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.sceneText).toBe(sceneText);
    }
  });
});

describe("contributionInputSchema", () => {
  it("принимает корректный текстовый вклад", () => {
    expect(contributionInputSchema.safeParse(validContribution).success).toBe(
      true,
    );
  });

  it.each(["image", "uri", "fileName", "base64"])(
    "отклоняет лишнее поле %s",
    (extraKey) => {
      const result = contributionInputSchema.safeParse({
        ...validContribution,
        [extraKey]: "local-photo.jpg",
      });

      expect(result.success).toBe(false);
    },
  );

  it("отклоняет невалидные идентификаторы", () => {
    expect(
      contributionInputSchema.safeParse({
        ...validContribution,
        clientContributionId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      contributionInputSchema.safeParse({
        ...validContribution,
        sourceMnemonicId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("отклоняет неверную локаль и дату", () => {
    expect(
      contributionInputSchema.safeParse({
        ...validContribution,
        locale: "en",
      }).success,
    ).toBe(false);
    expect(
      contributionInputSchema.safeParse({
        ...validContribution,
        submittedAt: "вчера",
      }).success,
    ).toBe(false);
  });

  it("нормализует краевые пробелы в тексте", () => {
    const result = contributionInputSchema.safeParse({
      ...validContribution,
      cueWord: "  Брат  ",
      sceneText: "  Брат похож на брата  ",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.cueWord).toBe("Брат");
      expect(result.data.sceneText).toBe("Брат похож на брата");
    }
  });
});

describe("contributionPreferenceSchema", () => {
  it.each(["unset", "granted", "declined", "ask_later", "withdrawn"])(
    "принимает статус %s",
    (status) => {
      expect(
        contributionPreferenceSchema.safeParse({
          status,
          consentVersion: CONSENT_VERSION,
        }).success,
      ).toBe(true);
    },
  );

  it("отклоняет неизвестный статус", () => {
    expect(
      contributionPreferenceSchema.safeParse({
        status: "accepted",
        consentVersion: CONSENT_VERSION,
      }).success,
    ).toBe(false);
  });

  it("отклоняет лишние поля", () => {
    expect(
      contributionPreferenceSchema.safeParse({
        status: "granted",
        consentVersion: CONSENT_VERSION,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("требует consentVersion длиной 1–32 символа", () => {
    expect(
      contributionPreferenceSchema.safeParse({
        status: "granted",
        consentVersion: "",
      }).success,
    ).toBe(false);
    expect(
      contributionPreferenceSchema.safeParse({
        status: "granted",
        consentVersion: "v".repeat(33),
      }).success,
    ).toBe(false);
  });
});

describe("normalizeText", () => {
  it("приводит полноширинные символы к NFKC", () => {
    expect(normalizeText("　Ｂｒａｔ　")).toBe("Brat");
  });

  it("обрезает края и схлопывает пробельные символы", () => {
    expect(normalizeText("  брат\t похож\n на   брата  ")).toBe(
      "брат похож на брата",
    );
  });

  it("возвращает пустую строку для строки из пробелов", () => {
    expect(normalizeText("   \t\n  ")).toBe("");
  });
});

describe("contributionHash", () => {
  it("совпадает с фиксированными SHA-256 векторами", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("😀")).toBe(
      "f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9",
    );
  });

  it("не зависит от регистра и краевых пробелов созвучия", () => {
    expect(contributionHash(" Брат ", "Брат похож на брата")).toBe(
      contributionHash("брат", "Брат похож на брата"),
    );
  });

  it("совпадает с фиксированными хешами на уровне contributionHash", () => {
    expect(contributionHash("", "")).toBe(
      "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b",
    );
    expect(contributionHash("abc", "")).toBe(
      "edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb",
    );
    expect(contributionHash("😀", "🙂 сцена")).toBe(
      "334362b67bac2f30dce3c7b44aa9191ea366851f3a85543774ca3890f2f3b0eb",
    );
  });
});

describe("паритет фикстур с мобильным контрактом", () => {
  it("хранит версию и канонический payload без изменений", () => {
    expect(fixtures.contractVersion).toBe("1.0");
    expect(fixtures.contractVersion).toBe(CONSENT_VERSION);
    expect(fixtures.contractPayload).toEqual({
      cueWord: "　Ｆｏｘ　",
      sceneText: "  Брат   похож на брата  ",
    });
  });

  it("воспроизводит contractHash из contractPayload", () => {
    expect(fixtures.contractHash).toBe(
      "75ebd2de71321314c4a4c8735cd46610095f5612da7f0febb97a59809c2ee0dc",
    );
    expect(fixtures.contractHash).toBe(
      contributionHash(
        fixtures.contractPayload.cueWord,
        fixtures.contractPayload.sceneText,
      ),
    );
  });

  it("воспроизводит все шесть hashCases", () => {
    expect(fixtures.hashCases).toHaveLength(6);

    for (const testCase of fixtures.hashCases) {
      expect(
        contributionHash(testCase.input.cueWord, testCase.input.sceneText),
      ).toBe(testCase.hash);
    }
  });
});
