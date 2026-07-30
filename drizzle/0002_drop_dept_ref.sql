-- Drop the department reference.
--
-- The form stopped asking for it, and no row ever carried one — checked before
-- writing this: `select count(dept_ref) from indents` was 0. Nothing is lost.
--
-- It is dropped rather than left in place because a column nothing writes and
-- nothing reads is a trap for the next person: it looks like data.

ALTER TABLE "indents" DROP COLUMN "dept_ref";
