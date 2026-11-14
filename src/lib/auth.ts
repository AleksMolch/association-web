/**
 * auth.ts — серверная конфигурация Better Auth.
 *
 * Email + пароль, подтверждение email в production, сброс пароля через
 * Resend. Роль пользователя хранится в additionalFields и недоступна для
 * изменения клиентом.
 */

import { expo } from "@better-auth/expo";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { buildTrustedOrigins } from "@/lib/auth-origins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { PD_CONSENT_VERSION, TERMS_VERSION } from "@/lib/pd-consent";

const appUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  appName: "Мнемослов",
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET ?? "development-only-change-this-secret",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: buildTrustedOrigins(appUrl, process.env.APP_MOBILE_ORIGIN),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: isProduction,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Сброс пароля Мнемослов",
        text: [
          "Здравствуйте!",
          "",
          "Вы запросили сброс пароля в сервисе «Мнемослов». Ссылка действует один час:",
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
        subject: "Подтвердите email в Мнемослов",
        text: [
          "Здравствуйте!",
          "",
          "Подтвердите адрес электронной почты, чтобы завершить регистрацию в сервисе «Мнемослов»:",
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
      pdConsentAt: {
        type: "string",
        required: false,
        input: true,
      },
      pdConsentVersion: {
        type: "string",
        required: false,
        input: true,
      },
      termsAcceptedAt: {
        type: "string",
        required: false,
        input: true,
      },
      termsVersion: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!user.pdConsentAt) {
            throw APIError.from("BAD_REQUEST", {
              code: "PD_CONSENT_REQUIRED",
              message: "PD_CONSENT_REQUIRED",
            });
          }
          return {
            data: {
              ...user,
              pdConsentAt: new Date().toISOString(),
              pdConsentVersion: PD_CONSENT_VERSION,
              termsAcceptedAt: new Date().toISOString(),
              termsVersion: TERMS_VERSION,
            },
          };
        },
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
  plugins: [expo(), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
