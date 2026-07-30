import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

/*
 * A local Postgres for development, with nothing to install.
 *
 * PGlite is Postgres compiled to WebAssembly; this wraps it in a TCP server
 * speaking the real Postgres wire protocol. The app connects with the same
 * postgres:// URL and the same driver it uses in production, so nothing in
 * src/ knows or cares that this is not a installed server.
 *
 * Data persists in .pglite/ between restarts. Delete that folder to start over.
 *
 * This is for development only. Deploy against a real Postgres — see README.
 */

const PORT = Number(process.env.LOCAL_DB_PORT ?? 55432);
const DATA_DIR = process.env.LOCAL_DB_DIR ?? './.pglite';

async function main() {
  console.log('Starting local Postgres (PGlite)…');

  const db = await PGlite.create({ dataDir: DATA_DIR });
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });

  server.addEventListener('error', (e: Event) => {
    console.error('socket server error:', (e as CustomEvent).detail ?? e);
  });
  server.addEventListener('connection', () => {
    console.log('client connected');
  });

  await server.start();

  console.log(`\n  Listening on 127.0.0.1:${PORT}`);
  console.log(`  Data directory: ${DATA_DIR}`);
  console.log(`\n  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres\n`);
  console.log('  Leave this running. Ctrl-C to stop.\n');

  const shutdown = async () => {
    console.log('\nStopping…');
    await server.stop();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Could not start the local database:', err);
  process.exit(1);
});
