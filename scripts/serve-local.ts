import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

/*
 * Serve the production build locally.
 *
 * `next build` with output:'standalone' writes a self-contained server, but it
 * deliberately does NOT copy `.next/static` or `public` into it — the
 * expectation is that a CDN serves those. Locally there is no CDN, so without
 * this the server starts, renders HTML, and serves no JavaScript at all.
 *
 * That failure is quiet and misleading. The pages look right, because they are
 * server-rendered; what breaks is everything that needs the client — including
 * every form, because React never hydrates and the browser falls back to a
 * native POST that Next does not answer. A sign-in form that clears itself and
 * reports nothing is what that looks like from the outside.
 *
 * Doing it by hand once per build is exactly the step that gets forgotten, so
 * it is a script.
 */

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.error('\n  No standalone build found. Run `npm run build` first.\n');
  process.exit(1);
}

/** Replace rather than merge: `cp -r src dest` nests a second copy inside when
 *  dest already exists, which yields .next/static/static and still no assets. */
function replace(from: string, to: string) {
  if (!existsSync(from)) return false;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  return true;
}

const copiedStatic = replace(
  join(root, '.next', 'static'),
  join(standalone, '.next', 'static'),
);
const copiedPublic = replace(join(root, 'public'), join(standalone, 'public'));

console.log(`\n  static assets: ${copiedStatic ? 'copied' : 'none found'}`);
console.log(`  public:        ${copiedPublic ? 'copied' : 'none found'}`);

const port = process.env.PORT ?? '3000';
console.log(`\n  Starting on http://localhost:${port}\n`);

const child = spawn(process.execPath, ['server.js'], {
  cwd: standalone,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    // Dual-stack, so the app is reachable from a phone on the same Wi-Fi.
    HOSTNAME: process.env.HOSTNAME ?? '::',
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
