ALTER TABLE "cookie_consents" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "cookie_consents" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "terms_accepted_at" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "terms_version" text;--> statement-breakpoint
UPDATE "user" SET "terms_accepted_at" = "pd_consent_at", "terms_version" = '2026-11-14' WHERE "pd_consent_at" IS NOT NULL AND "terms_accepted_at" IS NULL;
