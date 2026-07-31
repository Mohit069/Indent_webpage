-- Accounts, sessions, roles, activity log and notifications.
--
-- This is the migration that turns `people` from a list of names into a set of
-- user accounts. Everything before it ran without authentication; the acting-as
-- name was a cookie the browser chose and nothing verified it.
--
-- Two decisions here are worth stating, because both change who can do what and
-- a migration that does that silently is how an afternoon gets lost.
--
-- 1. Existing people keep their rows and get role HOD. They are the three
--    placeholders — "Approving Authority", "Plant Head", "Purchase Officer" —
--    and every indent_event written so far points at one of them. Deleting them
--    would break those foreign keys and erase the history they attribute.
--
-- 2. Their can_approve / can_reject are withdrawn. Migration 0003 granted both
--    to everyone so that nobody lost an ability they had that morning. The
--    requirement has since changed to "no department head can approve or
--    reject", and leaving the flags set would leave three approvers standing
--    who are meant to be historical records. They have no email and no password
--    hash, so none of them can be signed into — the withdrawal is belt and
--    braces, not the only thing stopping them.
--
-- Nobody can approve anything between this migration and the admin seed that
-- follows it. Run `npm run db:seed-admin` immediately after.

CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'HOD', 'PURCHASE');--> statement-breakpoint

ALTER TABLE "people" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "role" "user_role" DEFAULT 'HOD' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_department_id_departments_id_fk"
  FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- See note 2 above.
UPDATE "people" SET "can_approve" = false, "can_reject" = false;--> statement-breakpoint

CREATE INDEX "people_department_idx" ON "people" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "people_role_idx" ON "people" USING btree ("role");--> statement-breakpoint

-- Sessions -----------------------------------------------------------------
-- Server-side so that disabling an account or resetting a password can end a
-- signed-in browser immediately. Only the SHA-256 of the cookie's secret is
-- stored, so this table leaking does not let anyone sign in.

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_people_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."people"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "sessions_person_idx" ON "sessions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint

-- Activity log -------------------------------------------------------------
-- Wider than indent_events: sign-ins, user administration and department edits
-- as well as indent transitions. Append-only, and nothing in the application
-- issues an UPDATE or DELETE against it.

CREATE TABLE "activity_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "actor_name_snapshot" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "summary" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_people_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_log_actor_idx" ON "activity_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint

-- Notifications ------------------------------------------------------------

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "indent_id" uuid,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_person_id_people_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."people"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_indent_id_indents_id_fk"
  FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "notifications_person_unread_idx" ON "notifications" USING btree ("person_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");
