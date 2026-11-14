/**
 * email.ts — отправка писем через SMTP.
 *
 * Используется почтовый relay NetAngels (mail.netangels.ru). Секреты читаются
 * только на сервере. В development без SMTP-конфигурации письмо не уходит,
 * а в лог пишется только факт события без токенов и ссылок.
 */

import nodemailer, { type Transporter } from "nodemailer";

import { maskEmail, redactEmails } from "@/lib/redact";

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure = process.env.SMTP_SECURE !== "false";

  if (!host || !user || !pass) return null;
  if (cachedTransport) return cachedTransport;

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cachedTransport;
}

export async function sendEmail({ to, subject, text, html }: EmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM;
  const transport = getTransport();

  if (!transport || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email:dev] письмо не отправлено (нет SMTP_HOST/SMTP_USER/SMTP_PASS/EMAIL_FROM)", {
        to: maskEmail(to),
        subject,
      });
      return;
    }
    throw new Error("SMTP не настроен");
  }

  try {
    await transport.sendMail({ from, to, subject, text, html });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[email] SMTP вернул ошибку", redactEmails(detail).slice(0, 300));
    throw new Error("Не удалось отправить письмо");
  }
}
