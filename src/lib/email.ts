/**
 * email.ts — отправка писем через Resend.
 *
 * В разработке без ключа письмо не уходит, а в консоль пишется только факт
 * события (без токенов и ссылок). Для production задайте RESEND_API_KEY и
 * EMAIL_FROM либо замените провайдера.
 */

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

function maskEmail(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0) return "[redacted]";
  return `${value.slice(0, 1)}***@${value.slice(at + 1)}`;
}

function redactEmails(value: string): string {
  return value.replace(EMAIL_LIKE, (email) => maskEmail(email));
}

export async function sendEmail({ to, subject, text, html }: EmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email:dev] письмо не отправлено (нет RESEND_API_KEY/EMAIL_FROM)", {
        to: maskEmail(to),
        subject,
      });
    } else {
      console.error("[email] RESEND_API_KEY или EMAIL_FROM не заданы");
    }
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[email] Resend вернул ошибку",
      response.status,
      redactEmails(detail).slice(0, 300),
    );
    throw new Error("Не удалось отправить письмо");
  }
}
