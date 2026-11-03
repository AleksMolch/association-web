/**
 * auth.ts — серверная конфигурация Better Auth.
 *
 * Email + пароль, подтверждение email в production, сброс пароля через
 * Resend. Роль пользователя хранится в additionalFields и недоступна для
 * изменения клиентом.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

const appUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  appName: "Association",
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET ?? "development-only-change-this-secret",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: [appUrl],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: isProduction,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Сброс пароля Association",
        text: [
          "Здравствуйте!",
          "",
          "Вы запросили сброс пароля в Association. Ссылка действует один час:",
          url,
          "",
          "Если вы не запрашивали сброс, просто проигнорируйте письмо.",
        ].join("\n"),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: isProduction,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Подтвердите email в Association",
        text: [
          "Здравствуйте!",
          "",
          "Подтвердите адрес электронной почты, чтобы завершить регистрацию:",
          url,
          "",
          "Если вы не регистрировались, проигнорируйте письмо.",
        ].join("\n"),
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
