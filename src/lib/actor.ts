import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import type { Person } from '@/db/schema';

/*
 * Whose name goes on the next action.
 *
 * This module used to answer a much smaller question. There was no sign-in, and
 * "who is using this computer" was a cookie holding a person id — unsigned, not
 * secret, granting nothing. It existed so the printed indent's signature boxes
 * carried a name instead of being blank.
 *
 * It now delegates to the session. The name on an event is the name of whoever
 * authenticated, and nobody can put someone else's there by editing a cookie.
 *
 * The module is kept, rather than folded into auth.ts, because it is the seam:
 * roughly a dozen call sites ask it who is acting, and they neither know nor
 * care how that is established. Replacing the cookie with a session changed
 * this file and nothing downstream of it.
 */

/** Everyone who can be assigned work, in a stable order. Used by the Users and
 *  Departments screens — no longer by a picker, because there isn't one. */
export async function listPeople(): Promise<Person[]> {
  return db.select().from(people).where(eq(people.isActive, true)).orderBy(asc(people.name));
}

/**
 * The person acting, or null if nobody is signed in.
 *
 * Callers treat null as "cannot act". It used to mean "this device has not been
 * set up yet", which was a state you could act from; it no longer is.
 */
export async function getActor(): Promise<Person | null> {
  return getCurrentUser();
}

/**
 * The name and designation to stamp on an event.
 *
 * Still falls back to a placeholder rather than throwing. Nothing reaches a
 * write without passing the guard, so an unattributed event should be
 * unreachable — but if one ever is, recording it under a name that is visibly
 * not a person beats losing the action or serving a 500.
 */
export async function actorSnapshot(): Promise<{
  id: string | null;
  name: string;
  designation: string;
}> {
  const actor = await getActor();
  return actor
    ? { id: actor.id, name: actor.name, designation: actor.designation }
    : { id: null, name: 'Unattributed', designation: '—' };
}
