import { describe, expect, it } from "vitest";

import { detectSensitiveContent } from "@/lib/server/contribution-filter";

describe("detectSensitiveContent", () => {
  it("returns no flags for ordinary Russian association text", () => {
    expect(detectSensitiveContent("Брат похож на брата, оба улыбаются")).toEqual({
      email: false,
      phone: false,
      url: false,
    });
  });

  it("flags an email address", () => {
    expect(detectSensitiveContent("Пишите на brother@example.com")).toEqual({
      email: true,
      phone: false,
      url: false,
    });
  });

  it.each([
    "+7 (999) 123-45-67",
    "8 999 123 45 67",
    "+79991234567",
    "9991234567",
  ])("flags a phone number %s", (phone) => {
    expect(detectSensitiveContent(`Позвони ${phone} вечером`)).toMatchObject({
      phone: true,
    });
  });

  it.each([
    "https://example.com/scene",
    "http://example.com",
    "www.example.com",
    "example.com",
    "t.me/association",
  ])("flags a URL %s", (url) => {
    expect(detectSensitiveContent(`Смотри ${url}`)).toMatchObject({ url: true });
  });

  it("flags every category in a mixed text", () => {
    expect(
      detectSensitiveContent(
        "Почта test@example.com, сайт example.org, телефон +7 999 123 45 67",
      ),
    ).toEqual({ email: true, phone: true, url: true });
  });

  it("does not treat ordinary dates or short numbers as contacts", () => {
    expect(
      detectSensitiveContent("5 ноября 2026 года, 42 шага и 3 попытки"),
    ).toEqual({ email: false, phone: false, url: false });
  });

  it("does not report a URL for the domain part of an email", () => {
    expect(detectSensitiveContent("mail me at test@example.com")).toEqual({
      email: true,
      phone: false,
      url: false,
    });
  });
});
