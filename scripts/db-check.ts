import 'dotenv/config';
import postgres from 'postgres';

/*
 * Does DATABASE_URL point at a database this app can use?
 *
 * Run before db:push when pointing at a new host. drizzle-kit's failure mode
 * for an unreachable database is to sit on "Pulling schema from database…"
 * indefinitely, which tells you nothing; this connects with a timeout and says
 * what it found.
 *
 *   $env:DATABASE_URL = '…'      (PowerShell)
 *   npm run db:check
 */

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('\n  DATABASE_URL is not set.\n');
  process.exit(1);
}

/** Never print the password back at whoever is watching the terminal. */
function describe(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return `${u.username}@${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(could not parse the connection string)';
  }
}

const pooled = /pgbouncer=true/.test(url) || /-pooler\./.test(url);

async function main() {
  console.log(`\n  Target   ${describe(url!)}`);
  console.log(`  Pooling  ${pooled ? 'yes' : 'NO — see the note below'}`);

  const sql = postgres(url!, {
    max: 1,
    connect_timeout: 10,
    prepare: !pooled,
    onnotice: () => {},
  });

  try {
    const [{ version }] = await sql<{ version: string }[]>`select version()`;
    console.log(`  Server   ${version.split(' ').slice(0, 2).join(' ')}`);

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`;

    if (tables.length === 0) {
      console.log('\n  Empty database. Next:  npm run db:push  then  npm run db:seed\n');
    } else {
      console.log(`  Tables   ${tables.length} (${tables.map((t) => t.table_name).join(', ')})`);

      if (tables.some((t) => t.table_name === 'indents')) {
        const [{ count }] = await sql<{ count: string }[]>`select count(*) from indents`;
        const [{ count: people }] = await sql<{ count: string }[]>`select count(*) from people`;
        console.log(`  Indents  ${count}`);
        console.log(`  People   ${people}${people === '0' ? '  — run npm run db:seed' : ''}`);
      }
      console.log('\n  Reachable and set up.\n');
    }

    if (!pooled) {
      console.log(
        '  Note: this does not look like a pooled connection string. On Vercel,\n' +
          '  use the pooled one — the host usually has "-pooler" in it, or the URL\n' +
          '  carries pgbouncer=true. The direct endpoint runs out of connections.\n',
      );
    }

    await sql.end();
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  Could not connect: ${message}\n`);

    if (/ENOTFOUND|EAI_AGAIN/.test(message)) {
      console.error('  The hostname did not resolve — check it was copied whole.\n');
    } else if (/password authentication|SASL/i.test(message)) {
      console.error('  Reached the server, but the credentials were refused.\n');
    } else if (/timeout|ETIMEDOUT/i.test(message)) {
      console.error(
        '  Reached nothing before the timeout. Neon databases sleep when idle —\n' +
          '  try once more before assuming it is wrong.\n',
      );
    } else if (/SSL|certificate/i.test(message)) {
      console.error('  TLS was refused. Neon needs ?sslmode=require on the URL.\n');
    }

    await sql.end({ timeout: 1 }).catch(() => {});
    process.exit(1);
  }
}

main();
