import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

/*
 * Record migrations as applied without running them.
 *
 * Needed exactly once, because this database was built with `drizzle-kit push`
 * — which writes the schema straight from the TypeScript and keeps no record of
 * having done so. The migration files were written afterwards to describe the
 * same changes, so the tables are correct but Drizzle's ledger is empty, and
 * the next `db:migrate` would try to replay 0000 against a database that
 * already has every table in it.
 *
 * This is a claim, not a check: it asserts that the schema already matches
 * these migrations. Before running it, confirm that it does. For this database
 * that was verified column by column — no `specification` or `expected_date` on
 * indent_lines, no `dept_ref` on indents, and the four-value priority enum,
 * which is precisely the state 0000 through 0004 produce.
 *
 * Usage:  tsx scripts/baseline-migrations.ts 0004
 *         (marks every migration up to and including that tag as applied)
 */

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const upTo = process.argv[2];

if (!upTo) {
  console.error('\n  Usage: tsx scripts/baseline-migrations.ts <tag>');
  console.error('  e.g.   tsx scripts/baseline-migrations.ts 0004\n');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  DATABASE_URL is not set.\n');
  process.exit(1);
}

async function main() {
  const journalPath = join(process.cwd(), 'drizzle', 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };

  const cutoff = journal.entries.findIndex((e) => e.tag.startsWith(upTo));
  if (cutoff === -1) {
    console.error(`\n  No migration tagged "${upTo}" in the journal.\n`);
    process.exit(1);
  }

  const client = postgres(url!, { max: 1 });

  try {
    await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await client`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`;

    const already = await client<{ hash: string }[]>`
      SELECT hash FROM drizzle.__drizzle_migrations`;
    const known = new Set(already.map((r) => r.hash));

    let recorded = 0;

    for (const entry of journal.entries.slice(0, cutoff + 1)) {
      const sqlPath = join(process.cwd(), 'drizzle', `${entry.tag}.sql`);
      // The hash Drizzle stores is a SHA-256 of the whole file, unsplit. It must
      // be computed the same way here or the migrator will not recognise it.
      const hash = createHash('sha256').update(readFileSync(sqlPath, 'utf8')).digest('hex');

      if (known.has(hash)) {
        console.log(`  = ${entry.tag} (already recorded)`);
        continue;
      }

      await client`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})`;

      console.log(`  + ${entry.tag}`);
      recorded += 1;
    }

    console.log(`\n  ${recorded} migration(s) recorded as applied.`);
    console.log('  Run `npm run db:migrate` to apply anything after them.\n');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
