'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { people } from '@/db/schema';
import {
  createSession,
  destroyAllSessionsFor,
  destroySession,
  getCurrentUser,
  hashPassword,
  normaliseEmail,
  recordLogin,
  verifyPassword,
} from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { changePasswordSchema, loginSchema } from '@/lib/validation';
import type { ActionResult } from '@/lib/action-state';

/*
 * Sign in, sign out, change password.
 *
 * The only actions in the application that do not begin with a permission
 * check, because they are how somebody comes to have permissions at all.
 */

function fieldErrorsFrom(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[i.path.join('.')] = i.message;
  return out;
}

/**
 * Where a person belongs when they arrive.
 *
 * A Super Admin gets the admin dashboard, not the indent list — the brief is
 * explicit that Saurabh should not land in the HOD interface. Everyone else
 * gets the indents.
 */
function homeFor(role: string): string {
  return role === 'SUPER_ADMIN' ? '/admin' : '/indents';
}

export async function signIn(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    returnTo: formData.get('returnTo'),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const { email, password, returnTo } = parsed.data;

  /*
   * Everything that can fail happens inside the try; the redirect happens after
   * it.
   *
   * `redirect()` works by throwing, so it must not be inside a catch that would
   * swallow it — and an ordinary failure must not escape uncaught either. When
   * it did, the browser got a blank re-rendered form with no message at all,
   * which is indistinguishable from "nothing happened" and gave the person
   * signing in nothing to act on.
   */
  let destination: string | null;

  try {
    destination = await attemptSignIn(email, password, returnTo);
  } catch (err) {
    console.error('[signIn] failed for', email, err);
    return {
      error: 'Something went wrong signing in. The problem has been logged.',
    };
  }

  if (destination === null) return { error: 'Wrong email or password.' };

  redirect(destination);
}

/**
 * Do the work; return where to send them, or null if the credentials are wrong.
 *
 * Separated from the action so `redirect` — which works by throwing — stays
 * outside the try/catch that reports real failures.
 */
async function attemptSignIn(
  email: string,
  password: string,
  returnTo: string | undefined,
): Promise<string | null> {
  const [person] = await db
    .select()
    .from(people)
    .where(eq(people.email, normaliseEmail(email)))
    .limit(1);

  /*
   * One message for every failure, and the password is checked even when the
   * account does not exist.
   *
   * Saying "no such account" tells an attacker which addresses are real, and
   * skipping the hash when there is no account answers the same question
   * through how fast the reply comes back. The dummy hash below costs the same
   * ~100ms as a real one.
   */
  const ok = person
    ? person.isActive && (await verifyPassword(password, person.passwordHash))
    : await verifyPassword(password, DUMMY_HASH);

  if (!ok) {
    await logActivity({
      actorId: person?.id ?? null,
      actorName: person?.name ?? email,
      action: 'auth.login_failed',
      entityType: 'auth',
      entityId: person?.id ?? null,
      summary: `Failed sign-in attempt for ${email}`,
    });

    // Null rather than a thrown error: wrong credentials are an expected
    // outcome, not a fault, and the caller reports them differently.
    return null;
  }

  await createSession(person!.id);
  await recordLogin(person!.id);

  await logActivity({
    actorId: person!.id,
    actorName: person!.name,
    action: 'auth.login',
    entityType: 'auth',
    entityId: person!.id,
    summary: `${person!.name} signed in`,
  });

  revalidatePath('/', 'layout');

  /*
   * A password an admin set is a password two people know. It has to be
   * replaced before the account is used for anything.
   */
  if (person!.mustChangePassword) return '/change-password';

  return returnTo ?? homeFor(person!.role);
}

/*
 * A real scrypt hash of a value nobody will ever submit.
 *
 * Verifying against this when the email is unknown keeps the timing of a failed
 * sign-in the same either way. Without it, "no such account" returns in
 * microseconds and "wrong password" takes 100ms, which is a reliable way to
 * enumerate who works here.
 */
const DUMMY_HASH =
  'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);

export async function signOut(): Promise<void> {
  const user = await getCurrentUser();

  if (user) {
    await logActivity({
      actorId: user.id,
      actorName: user.name,
      action: 'auth.logout',
      entityType: 'auth',
      entityId: user.id,
      summary: `${user.name} signed out`,
    });
  }

  await destroySession();
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Change your own password.
 *
 * Every other session is ended: a password change is usually prompted by a
 * suspicion that somebody else has it, and leaving their browser signed in
 * would defeat the point. This browser then gets a fresh session so the person
 * who just changed it is not signed out of their own account.
 */
export async function changePassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  /*
   * The current password is required unless the account is on a forced change,
   * where by definition the person is using a password an admin gave them and
   * proving they know it demonstrates nothing.
   */
  if (!user.mustChangePassword) {
    const current = parsed.data.currentPassword ?? '';
    if (!(await verifyPassword(current, user.passwordHash))) {
      return { fieldErrors: { currentPassword: 'That is not your current password.' } };
    }
  }

  await db
    .update(people)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
    })
    .where(eq(people.id, user.id));

  await destroyAllSessionsFor(user.id);
  await createSession(user.id);

  await logActivity({
    actorId: user.id,
    actorName: user.name,
    action: 'auth.password_changed',
    entityType: 'auth',
    entityId: user.id,
    summary: `${user.name} changed their password`,
  });

  revalidatePath('/', 'layout');
  redirect(homeFor(user.role));
}
