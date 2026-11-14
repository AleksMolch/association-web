/** Тесты перевода ошибок Better Auth. */

import { describe, expect, it } from "vitest";

import { humanizeAuthError, stripAuthErrorPrefix } from "./auth-errors";

describe("auth errors", () => {
  it("убирает технический префикс", () => {
    expect(stripAuthErrorPrefix("[body.email] Invalid email address")).toBe(
      "Invalid email address",
    );
  });

  it("переводит неверный email", () => {
    expect(
      humanizeAuthError("[body.email] Invalid email address", "Ошибка"),
    ).toBe("Введите корректный email.");
  });

  it("переводит неверную пару email/пароль", () => {
    expect(
      humanizeAuthError("Invalid email or password", "Ошибка"),
    ).toBe("Неверный email или пароль.");
  });

  it("переводит существующий аккаунт", () => {
    expect(
      humanizeAuthError("User already exists", "Ошибка"),
    ).toBe("Аккаунт с таким email уже существует. Войдите или сбросьте пароль.");
  });

  it("возвращает fallback для неизвестной ошибки", () => {
    expect(humanizeAuthError("[body.email] Something weird", "Русский текст")).toBe(
      "Русский текст",
    );
  });

  it("возвращает fallback без сообщения", () => {
    expect(humanizeAuthError(undefined, "Русский текст")).toBe("Русский текст");
  });
});
