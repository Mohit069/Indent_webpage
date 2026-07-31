import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/*
 * Apply pending migrations.
 *
 * Its own connection, with max: 1, rather than the application's pool. The
 * migrator holds an advisory lock for the duration and runs statements in
 * order; handing it a pool of ten invites two of them to interleave.
 *
 * Drizzle records what it has applied in `drizzle.__drizzle_migrations`, so
 * running this against an up-to-date database does nothing and is safe.
 */

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('\n  DATABASE_URL is not set. Copy .env.example to .env first.\n');
  process.exit(1);
}

async function main() {
  const client = postgres(url!, { max: 1 });

  try {
    console.log('\n  Applying migrations…');
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    console.log('  Up to date.\n');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n  Migration failed. Nothing was left half-applied — each');
  console.error('  migration runs in its own transaction.\n');
  console.error(err);
  process.exit(1);
});
