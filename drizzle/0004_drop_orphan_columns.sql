-- Four columns nothing could write.
--
-- Each was checked for data before being dropped:
--   indent_lines.specification   0 of 5 rows
--   indent_lines.expected_date   0 of 5 rows
--   indents.legacy_serial_no     0 of 3 rows
--   indents.closed_at            0 of 3 rows
--
-- indent_lines.specification never had an input of its own; the item name box
-- carries the specification. indent_lines.expected_date was a per-row date, but
-- the form only ever had one date for the indent as a whole. legacy_serial_no
-- was for indents migrated from the paper book, which never happened, and
-- closed_at belonged to a "procured" step the shortened workflow does not have.
--
-- indent_lines.item_id is deliberately NOT dropped. The catalog dropdown that
-- set it is gone, so nothing writes it any more, but two rows still point at an
-- item and the detail and print pages read the item's name through it.
--
-- Note for anyone reading hashLines(): removing specification does NOT change
-- the tamper digest. Every row held null, which contributed an empty string to
-- the canonical form, and that empty string is still there deliberately so the
-- hashes recorded against indents already signed off keep verifying.

ALTER TABLE "indent_lines" DROP COLUMN "specification";--> statement-breakpoint
ALTER TABLE "indent_lines" DROP COLUMN "expected_date";--> statement-breakpoint
ALTER TABLE "indents" DROP COLUMN "legacy_serial_no";--> statement-breakpoint
ALTER TABLE "indents" DROP COLUMN "closed_at";
