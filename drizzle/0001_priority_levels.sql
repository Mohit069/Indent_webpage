-- Priority becomes a deadline rather than an adjective.
--
--   NORMAL / URGENT / CRITICAL  ->  ASAP / LEVEL_1 / LEVEL_2 / LEVEL_3
--
-- The generated version of this migration cast the column straight into the
-- new type, which fails the moment a row still says 'CRITICAL' — the value no
-- longer exists to cast into. So the column is parked as text, the old words
-- are translated, and only then is the type replaced.
--
-- Mapping, least surprising reading of each:
--   CRITICAL -> ASAP      (drop everything)
--   URGENT   -> LEVEL_1   (within a week)
--   NORMAL   -> LEVEL_3   (routine; the new default)
--
-- LEVEL_2 is intentionally unused here. Nothing in the old three-value scale
-- meant "within two weeks", and inventing that claim on someone's behalf would
-- put a deadline in the record that they never agreed to.

ALTER TABLE "indents" ALTER COLUMN "priority" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."indents" ALTER COLUMN "priority" SET DATA TYPE text;--> statement-breakpoint
UPDATE "indents" SET "priority" = CASE "priority"
        WHEN 'CRITICAL' THEN 'ASAP'
        WHEN 'URGENT'   THEN 'LEVEL_1'
        WHEN 'NORMAL'   THEN 'LEVEL_3'
        ELSE "priority"
    END;--> statement-breakpoint
DROP TYPE "public"."priority";--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('ASAP', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3');--> statement-breakpoint
ALTER TABLE "public"."indents" ALTER COLUMN "priority" SET DATA TYPE "public"."priority" USING "priority"::"public"."priority";--> statement-breakpoint
ALTER TABLE "indents" ALTER COLUMN "priority" SET DEFAULT 'LEVEL_3';
