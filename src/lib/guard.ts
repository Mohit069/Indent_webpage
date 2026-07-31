import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { can, PermissionError, type Permission } from '@/lib/rbac';
import type { Person } from '@/db/schema';

/*
 * The gate.
 *
 * Every page and every action that is not public begins with a call in here.
 * Hiding a link or a button is a courtesy to whoever is looking at the screen;
 * it is not a control, because a server action is an HTTP endpoint and anyone
 * can post to it directly. This module is where the answer is actually decided.
 *
 * Two shapes, for two callers:
 *
 *   requireUser / requirePermission   redirect. For pages — landing on the
 *                                     sign-in screen is the right outcome when
 *                                     a navigation is not allowed.
 *
 *   authorize                         returns or throws. For actions, which
 *                                     have no page to send anybody to and whose
 *                                     caller wants an error to show in place.
 */

/** The signed-in person, or a redirect to sign in. */
export async function requireUser(): Promise<Person> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * The signed-in person, if they hold this permission.
 *
 * Someone signed out goes to the sign-in screen. Someone signed in who simply
 * may not is sent to /denied rather than to sign-in — bouncing them to a login
 * form they have already completed reads as a broken app, not as a refusal.
 */
export async function requirePermission(permission: Permission): Promise<Person> {
  const user = await requireUser();
  if (!can(user, permission)) redirect('/denied');
  return user;
}

/**
 * The signed-in person, if they hold this permission — for server actions.
 *
 * Throws rather than redirecting. `redirect()` inside an action aborts by
 * throwing a control-flow signal, which would be caught by the action's own
 * error handling and reported to the user as an unrelated failure.
 */
export async function authorize(permission: Permission): Promise<Person> {
  const user = await getCurrentUser();
  if (!user) throw new PermissionError(permission);
  if (!can(user, permission)) throw new PermissionError(permission);
  return user;
}
