import 'server-only';
import { db } from '@/db';
import { activityLog } from '@/db/schema';

/*
 * The activity log.
 *
 * Distinct from `indent_events`, and both are worth having. indent_events is
 * the workflow history of one indent — it drives the printed signature boxes
 * and the tamper digest, and its shape is fixed by what the paper form needs.
 * This is the wider record: sign-ins, accounts created, roles changed,
 * departments edited. An indent approval writes to both, because "what happened
 * to indent 0954" and "what did Saurabh do on Tuesday" are different questions
 * and neither table answers the other well.
 *
 * Append-only. There is no update and no delete in this module, and nothing
 * else in the application writes to the table.
 */

/** Dotted and stable: the machine-readable half of an entry. Kept as a union so
 *  a typo becomes a compile error rather than a row nobody can filter on. */
export type ActivityAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.password_changed'
  | 'indent.create'
  | 'indent.submit'
  | 'indent.approve'
  | 'indent.reject'
  | 'indent.delete_draft'
  | 'user.create'
  | 'user.update'
  | 'user.disable'
  | 'user.enable'
  | 'user.role_changed'
  | 'user.password_reset'
  | 'department.create'
  | 'department.update'
  | 'masters.create';

export type ActivityEntityType = 'indent' | 'person' | 'department' | 'auth' | 'masters';

/**
 * Record something that happened.
 *
 * Never throws. A failure to write the log must not roll back the thing being
 * logged — an approval that succeeded and went unrecorded is bad, but an
 * approval refused because its log entry could not be written is worse, and the
 * user cannot do anything about either. The failure goes to the server console,
 * which is where an operator would look.
 */
export async function logActivity(entry: {
  actorId: string | null;
  actorName: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;
  summary: string;
}): Promise<void> {
  try {
    await db.insert(activityLog).values({
      actorId: entry.actorId,
      actorNameSnapshot: entry.actorName,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
    });
  } catch (err) {
    console.error('[activity] failed to record', entry.action, err);
  }
}
