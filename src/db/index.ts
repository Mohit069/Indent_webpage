import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/*
 * One connection pool per process.
 *
 * Next.js re-evaluates modules on every hot reload in development, which would
 * otherwise open a new pool each time until Postgres refuses connections. The
 * pool is parked on globalThis so reloads reuse it.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres database.',
  );
}

const globalForDb = globalThis as unknown as {
  __indentSql?: ReturnType<typeof postgres>;
};

/*
 * Serverless hosts need different pool settings from a long-running server.
 *
 * On a VPS one process serves everything, so a pool of ten is right. On Vercel
 * every concurrent invocation is its own process with its own pool, so ten
 * apiece exhausts the database's connection limit under mild load. There the
 * answer is one connection each, in front of a pooler.
 *
 * Poolers in transaction mode (Supabase's 6543 port, Neon's -pooler host) also
 * cannot serve prepared statements, which postgres.js uses by default — hence
 * turning them off when the connection string says it is talking to pgbouncer.
 */
const isServerless = Boolean(process.env.VERCEL);
const behindPooler =
  /pgbouncer=true/.test(connectionString) || /-pooler\./.test(connectionString);

const client =
  globalForDb.__indentSql ??
  postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_MAX ?? (isServerless ? 1 : 10)),
    prepare: !behindPooler,
    // Postgres stores timestamptz correctly regardless; this keeps the driver's
    // own date handling from re-interpreting values in the server's local zone.
    transform: { undefined: null },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__indentSql = client;
}

export const db = drizzle(client, { schema });
export { schema };
export type Db = typeof db;

/** The raw driver, for transactions that need SELECT ... FOR UPDATE. */
export const sqlClient = client;
