import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { people, sessions } from '../src/db/schema';

/*
 * Render every page as a signed-in Super Admin.
 *
 * Worth having as its own check because a broken query inside a page shows up
 * as a 500 and nothing else — the type checker cannot see it, and verify.ts
 * exercises the libraries rather than the routes. The bug that prompted this
 * was a JavaScript Date interpolated into a raw `sql` fragment on the
 * dashboard: it compiled, it passed every test, and it threw the moment
 * anybody opened /admin.
 *
 * Needs the app running. The mustChangePassword flag is switched off for the
 * duration and restored in `finally`, because it would otherwise redirect away
 * from the pages under test.
 *
 * Usage:  npm run check:pages [baseUrl]
 *
 * The URL is an argument rather than a constant so this can be pointed at a
 * deployment, not only at localhost. A page that renders on your machine and
 * 500s in production — because of an environment variable, a pooled connection,
 * or a serverless cold start — is exactly the failure this is meant to catch,
 * and it cannot catch it if it can only ever reach your machine. Run it against
 * DATABASE_URL pointed at the same database the deployment is using.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';

async function main() {
  console.log(`\n  against ${BASE}\n`);
  const [p] = await db.select().from(people).where(eq(people.role, 'SUPER_ADMIN')).limit(1);
  const original = p.mustChangePassword;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.insert(sessions).values({
    personId: p.id, tokenHash, expiresAt: new Date(Date.now() + 600000),
  });
  await db.update(people).set({ mustChangePassword: false }).where(eq(people.id, p.id));

  try {
    for (const path of ['/admin', '/admin/pending', '/admin/indents', '/admin/users',
                        '/admin/departments', '/admin/reports', '/admin/activity', '/indents']) {
      const res = await fetch(`${BASE}${path}`, {
        redirect: 'manual', headers: { cookie: `indent_session=${token}` },
      });
      const body = res.status === 200 ? await res.text() : '';
      const broken = body.includes('Application error') || body.includes('server-side exception');
      console.log(`  ${res.status}${broken ? ' BROKEN' : ''}  ${path}`);
    }
  } finally {
    await db.update(people).set({ mustChangePassword: original }).where(eq(people.id, p.id));
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    console.log('\n  state restored');
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
