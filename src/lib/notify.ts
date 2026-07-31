import 'server-only';
import { and, eq, isNull, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { notifications, people } from '@/db/schema';

/*
 * In-app notifications.
 *
 * The requirement is a badge — "Pending Approval (5)" — and a note to the
 * requester when their indent is decided. Both are reads against one table.
 *
 * Deliberately not email. Mail introduces a second system that can be down, a
 * queue to drain and credentials to hold, and none of that is needed to put a
 * number next to a sidebar link. If mail is wanted later it becomes a reader of
 * this table, not a replacement for it.
 *
 * Like the activity log, nothing here throws: a notification that fails to
 * write must not take an approval down with it.
 */

/** Everyone who should hear that an indent is waiting. Anyone who can approve —
 *  so appointing a second Super Admin starts notifying them with no other
 *  change. */
async function approvers(): Promise<{ id: string }[]> {
  return db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.isActive, true), inArray(people.role, ['SUPER_ADMIN'])));
}

export async function notifySubmitted(opts: {
  indentId: string;
  indentNo: string;
  requesterName: string;
  departmentName: string;
}): Promise<void> {
  try {
    const recipients = await approvers();
    if (recipients.length === 0) return;

    await db.insert(notifications).values(
      recipients.map((r) => ({
        personId: r.id,
        kind: 'indent.submitted',
        title: `${opts.indentNo} needs approval`,
        body: `${opts.requesterName} raised it for ${opts.departmentName}.`,
        indentId: opts.indentId,
      })),
    );
  } catch (err) {
    console.error('[notify] submitted', err);
  }
}

/**
 * Tell the person who raised an indent what was decided.
 *
 * `raisedById` is nullable — the three placeholder people predate accounts, and
 * an indent of theirs has nobody to notify. Skipping quietly is right: there is
 * no one to tell.
 */
export async function notifyDecision(opts: {
  indentId: string;
  indentNo: string;
  raisedById: string | null;
  approved: boolean;
  deciderName: string;
}): Promise<void> {
  if (!opts.raisedById) return;

  try {
    await db.insert(notifications).values({
      personId: opts.raisedById,
      kind: opts.approved ? 'indent.approved' : 'indent.rejected',
      title: `${opts.indentNo} was ${opts.approved ? 'approved' : 'rejected'}`,
      body: `${opts.deciderName} ${opts.approved ? 'approved' : 'rejected'} it.`,
      indentId: opts.indentId,
    });
  } catch (err) {
    console.error('[notify] decision', err);
  }
}

export async function unreadCount(personId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.personId, personId), isNull(notifications.readAt)));
  return rows.length;
}

export async function listNotifications(personId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.personId, personId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllRead(personId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.personId, personId), isNull(notifications.readAt)));
}
