import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import type { Person } from '@/db/schema';

/*
 * Who is using this computer.
 *
 * There is no sign-in. This module answers a much smaller question: whose name
 * goes on the next action, so the printed indent's signature boxes are not
 * blank.
 *
 * It is pinned to the *device*, not to a session. Each machine is set once —
 * the purchase desk is always the purchase officer, the director's laptop is
 * always the director — and then nobody has to remember to change a dropdown.
 * That removes the most likely real-world failure here, which is not fraud but
 * an indent printed under the wrong name because the last person left the
 * picker where they found it.
 *
 * The cookie holds a person id and nothing else. It is not signed, not secret,
 * and grants nothing — every page is reachable regardless of what it says.
 */

const COOKIE = 'indent_acting_as';
const TEN_YEARS = 60 * 60 * 24 * 3650;

/** Everyone in the picker, in a stable order. */
export const listPeople = cache(async (): Promise<Person[]> => {
  return db
    .select()
    .from(people)
    .where(eq(people.isActive, true))
    .orderBy(asc(people.name));
});

/**
 * The person this device is set to, or null if it has not been set yet.
 *
 * Deliberately does NOT fall back to "the first person on the list". A silent
 * default is exactly how the wrong name ends up printed on an indent — better
 * to ask once, on first use, than to guess quietly forever.
 */
export const getActor = cache(async (): Promise<Person | null> => {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (!id) return null;

  const everyone = await listPeople();
  return everyone.find((p) => p.id === id) ?? null;
});

export async function setActorCookie(personId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, personId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: TEN_YEARS,
  });
}

/**
 * The name and designation to stamp on an event.
 *
 * Falls back to a placeholder rather than failing, so a half-configured install
 * still records *something* instead of losing the action.
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
