import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { people, sessions } from '../src/db/schema';
import { verifyPassword } from '../src/lib/password';

/*
 * Authentication, checked against the real database and the running server.
 *
 * verify.ts proves the policy in isolation, on PGlite. This proves the parts
 * that only mean something once there is a real account and a real HTTP
 * request: that the stored hash verifies, that a session cookie is honoured,
 * and that revoking one takes effect immediately.
 *
 * Needs the app running. Usage:
 *   npx tsx scripts/auth-check.ts <email> <password> [baseUrl]
 */

const BASE = process.argv[4] ?? 'http://localhost:3000';
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Where a request lands without following the redirect. */
async function probe(path: string, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
  return { status: res.status, location: res.headers.get('location') ?? '' };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('\n  Usage: npx tsx scripts/auth-check.ts <email> <password> [baseUrl]\n');
    process.exit(1);
  }

  console.log('\nStored credentials');

  const [person] = await db
    .select()
    .from(people)
    .where(eq(people.email, EMAIL.toLowerCase()))
    .limit(1);

  check('the account exists', Boolean(person), EMAIL);
  if (!person) process.exit(1);

  check('it is a Super Admin', person.role === 'SUPER_ADMIN', person.role);
  check('it is active', person.isActive);
  check('it has a password set', person.passwordHash !== null);
  check('the password is not stored in the clear', person.passwordHash !== PASSWORD);
  check('the real password verifies', await verifyPassword(PASSWORD, person.passwordHash));
  check(
    'a wrong password does not',
    !(await verifyPassword(PASSWORD + 'x', person.passwordHash)),
  );

  console.log('\nThe guard, over HTTP, signed out');

  for (const path of ['/indents', '/admin', '/admin/users', '/admin/pending', '/profile']) {
    const r = await probe(path);
    check(`${path} refuses an anonymous request`, r.status === 307 && r.location === '/login',
      `${r.status} -> ${r.location || '(none)'}`);
  }

  const open = await probe('/login');
  check('but /login itself is reachable', open.status === 200, String(open.status));

  console.log('\nA session cookie, over HTTP');

  /*
   * Issued the same way createSession does — a random secret in the cookie,
   * only its SHA-256 in the table. Doing it here rather than through the form
   * isolates what is being tested: whether the server honours a valid session,
   * independently of Next's form plumbing.
   */
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await db.insert(sessions).values({
    personId: person.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const cookie = `indent_session=${token}`;

  const admin = await probe('/admin', cookie);
  /*
   * A freshly seeded admin is flagged to change their password, so /admin
   * legitimately bounces to /change-password. Either outcome proves the session
   * was read and accepted — what would fail is being sent back to /login.
   */
  check(
    'a valid session is accepted',
    admin.location !== '/login',
    `${admin.status} -> ${admin.location || 'rendered'}`,
  );

  if (person.mustChangePassword) {
    check(
      'and a forced password change is enforced first',
      admin.location === '/change-password',
      admin.location,
    );
  }

  const changePw = await probe('/change-password', cookie);
  check('the change-password page renders for them', changePw.status === 200,
    String(changePw.status));

  console.log('\nRevocation');

  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));

  const after = await probe('/admin', cookie);
  check(
    'deleting the session row locks the browser out at once',
    after.status === 307 && after.location === '/login',
    `${after.status} -> ${after.location}`,
  );

  const forged = await probe('/admin', 'indent_session=not-a-real-token');
  check('a forged cookie is refused', forged.status === 307 && forged.location === '/login',
    `${forged.status} -> ${forged.location}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
