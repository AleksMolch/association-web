CREATE TABLE "contribution_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"consent_version" text,
	"decided_at" timestamp with time zone,
	"next_prompt_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mnemonic_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_contribution_id" text NOT NULL,
	"contributor_user_id" text,
	"source_mnemonic_id" text,
	"word_id" integer NOT NULL,
	"meaning_id" text NOT NULL,
	"cue_word" text NOT NULL,
	"scene_text" text NOT NULL,
	"locale" text NOT NULL,
	"consent_version" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"normalized_hash" text NOT NULL,
	"moderation_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mnemonics" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"word_id" integer NOT NULL,
	"meaning_id" text NOT NULL,
	"cue_word" text NOT NULL,
	"scene_text" text NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"rev" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "exercise_type" text DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "contribution_preferences" ADD CONSTRAINT "contribution_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mnemonic_contributions" ADD CONSTRAINT "mnemonic_contributions_contributor_user_id_user_id_fk" FOREIGN KEY ("contributor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mnemonics" ADD CONSTRAINT "user_mnemonics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mnemonic_contributions_contributor_client_uq" ON "mnemonic_contributions" USING btree ("contributor_user_id","client_contribution_id");--> statement-breakpoint
CREATE INDEX "mnemonic_contributions_queue_idx" ON "mnemonic_contributions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "user_mnemonics_owner_word_idx" ON "user_mnemonics" USING btree ("user_id","word_id") WHERE "user_mnemonics"."deleted_at" is null;