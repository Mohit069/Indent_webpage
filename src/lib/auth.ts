import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '@/db';
import { people, sessions } from '@/db/schema';
import type { Person } from '@/db/schema';

/*
 * Sessions.
 *
 * Password hashing lives in password.ts, which is deliberately not server-only
 * so the seed script can import the same implementation rather than carry a
 * copy of it. They are re-exported here so the rest of the application has one
 * obvious place to ask about authentication.
 *
 * Sessions are rows, not self-contained tokens. A JWT cannot be withdrawn
 * before it expires, so disabling an account would leave that person signed in
 * until it lapsed. A row can be deleted, which is what makes "Disable" and
 * "Reset Password" take effect at once rather than eventually.
 */

export { hashPassword, verifyPassword, normaliseEmail } from '@/lib/password';

const SESSION_COOKIE = 'indent_session';
const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/** Only the digest is stored, so this table leaking does not hand anyone a
 *  working cookie. */
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Start a session and set the cookie.
 *
 * httpOnly so no script can read it, sameSite lax so it survives following a
 * link into the app but is not sent on a cross-site form post, and secure
 * whenever we are not on plain-http localhost.
 */
export async function createSession(personId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_MS);

  await db.insert(sessions).values({
    personId,
    tokenHash: digest(token),
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    /*
     * maxAge in seconds, not `expires` as a Date.
     *
     * Passing a Date here threw from inside the response-header serialiser on
     * the production server — "Received an instance of Date" — which meant
     * sign-in failed after the password had already been checked and the
     * session row written. It surfaced as a blank 200 with no cookie, because
     * the throw happened while the response was being streamed.
     *
     * maxAge is also the better expression of the intent: it is relative, so it
     * cannot disagree with the expiresAt written on the row above the way two
     * separately-computed absolute times can.
     */
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  // Opportunistic tidy-up. Cheap, indexed, and it keeps the table from growing
  // without bound on an install nobody administers.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/**
 * The signed-in person, or null.
 *
 * `cache` scopes memoisation to the request, so the twenty-odd places that ask
 * "who is this" during one render share a single query.
 *
 * An expired or unknown token, a deleted account and a deactivated account all
 * return null — the caller never has to ask why, only whether.
 */
export const getCurrentUser = cache(async (): Promise<Person | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ person: people })
    .from(sessions)
    .innerJoin(people, eq(sessions.personId, people.id))
    .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  // Deactivating an account takes effect on the next request, without waiting
  // for the session row to be cleaned up.
  if (!row.person.isActive) return null;

  return row.person;
});

/** End this browser's session. Other devices stay signed in. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
  }

  store.delete(SESSION_COOKIE);
}

/**
 * End every session this person holds, everywhere.
 *
 * Called when a password is reset or an account disabled. Without it, "Reset
 * Password" would change what they type next time while leaving the browser
 * they are currently signed into untouched — which is not what anybody means
 * by resetting a password.
 */
export async function destroyAllSessionsFor(personId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.personId, personId));
}

export async function recordLogin(personId: string): Promise<void> {
  await db.update(people).set({ lastLoginAt: new Date() }).where(eq(people.id, personId));
}
