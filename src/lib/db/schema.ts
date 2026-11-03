/**
 * schema.ts — схема PostgreSQL для Association Web.
 *
 * Таблицы Better Auth (user/session/account/verification) дополнены
 * прогрессом, настройками, платежами и аудитом. Контент словаря остаётся
 * статическим JSON в репозитории и не дублируется в БД.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("session_user_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("account_user_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wordId: integer("word_id").notNull(),
    meaningId: text("meaning_id").default("").notNull(),
    direction: text("direction").default("en-ru").notNull(),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: real("stability").default(0).notNull(),
    difficulty: real("difficulty").default(0).notNull(),
    scheduledDays: integer("scheduled_days").default(0).notNull(),
    reps: integer("reps").default(0).notNull(),
    lapses: integer("lapses").default(0).notNull(),
    learningSteps: integer("learning_steps").default(0).notNull(),
    state: integer("state").default(0).notNull(),
    lastReview: timestamp("last_review", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    rev: integer("rev").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("cards_user_word_uq").on(table.userId, table.wordId),
    index("cards_user_due_idx").on(table.userId, table.due),
  ],
);

export const selections = pgTable(
  "selections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wordId: integer("word_id").notNull(),
    mnemonicId: text("mnemonic_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("selections_user_word_uq").on(table.userId, table.wordId)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    usedHint: boolean("used_hint").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reviews_user_created_idx").on(table.userId, table.createdAt),
    index("reviews_card_idx").on(table.cardId),
  ],
);

export const settings = pgTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  dailyGoal: integer("daily_goal").default(10).notNull(),
  hintsEnabled: boolean("hints_enabled").default(true).notNull(),
  reducedMotion: boolean("reduced_motion").default(false).notNull(),
  ttsRate: real("tts_rate").default(0.95).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").default("RUB").notNull(),
    status: text("status").default("pending").notNull(),
    providerPaymentId: text("provider_payment_id").unique(),
    idempotenceKey: text("idempotence_key").notNull().unique(),
    confirmationUrl: text("confirmation_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("payments_user_idx").on(table.userId),
    index("payments_status_idx").on(table.status),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(),
    status: text("status").default("active").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    paymentId: text("payment_id").references(() => payments.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("subscriptions_user_idx").on(table.userId),
    index("subscriptions_status_end_idx").on(table.status, table.endsAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_log_created_idx").on(table.createdAt)],
);
