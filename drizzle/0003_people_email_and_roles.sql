-- An email address per person, and who may decide an indent.
--
-- The columns default to false, which is right for anyone added from now on: a
-- new name should arrive with no authority until it is granted.
--
-- Applying that default to the rows that already exist is a different thing. It
-- would silently withdraw an ability everyone currently has, and the first
-- anyone would know of it is an indent that cannot be approved. A migration
-- should not change who can do what, so existing people are granted both —
-- exactly what they could do the moment before it ran.

ALTER TABLE "people" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "can_approve" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "can_reject" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "people" SET "can_approve" = true, "can_reject" = true;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_email_unique" UNIQUE("email");
