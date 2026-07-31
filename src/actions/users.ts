'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { people } from '@/db/schema';
import type { UserRole } from '@/db/schema';
import { authorize } from '@/lib/guard';
import { destroyAllSessionsFor, hashPassword, normaliseEmail } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { PermissionError } from '@/lib/rbac';
import {
  formFlag,
  formValues,
  personSchema,
  resetPasswordSchema,
} from '@/lib/validation';
import type { ActionResult } from '@/lib/action-state';

/*
 * User administration.
 *
 * Every function begins with `authorize('user:manage')`. That is the control —
 * not the fact that these screens sit behind a sidebar link an HOD cannot see,
 * because a server action is an endpoint and the sidebar is only a picture of
 * one.
 *
 * Nobody is ever deleted. A person's name is on the history of every indent
 * they touched, and `indent_events.actor_id` is a foreign key that has to keep
 * resolving. "Remove" means deactivate, which blocks sign-in immediately and
 * ends any session they hold.
 */

function fieldErrorsFrom(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[i.path.join('.')] = i.message;
  return out;
}

/** Turns the thrown permission error into something a form can display, rather
 *  than letting it surface as an unexplained server error. */
function refuse(err: unknown): ActionResult {
  if (err instanceof PermissionError) {
    return { error: 'You are not allowed to manage users.' };
  }
  throw err;
}

export async function createUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await authorize('user:manage');
  } catch (err) {
    return refuse(err);
  }

  // phone, departmentId and password are all optional and all routinely left
  // blank or absent — read through formValue so absent means absent.
  const parsed = personSchema.safeParse({
    ...formValues(formData, [
      'name',
      'designation',
      'email',
      'phone',
      'role',
      'departmentId',
      'password',
    ]),
    canApprove: formFlag(formData, 'canApprove'),
    canReject: formFlag(formData, 'canReject'),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const data = parsed.data;

  try {
    await db.insert(people).values({
      name: data.name,
      designation: data.designation,
      email: normaliseEmail(data.email),
      phone: data.phone ?? null,
      role: data.role,
      // Only an HOD is scoped to one department. Storing it for the others
      // would imply a restriction that rbac does not apply.
      departmentId: data.role === 'HOD' ? (data.departmentId ?? null) : null,
      passwordHash: data.password ? await hashPassword(data.password) : null,
      // A password an admin typed is one two people know.
      mustChangePassword: Boolean(data.password),
      canApprove: data.canApprove,
      canReject: data.canReject,
    });
  } catch {
    return { fieldErrors: { email: 'Someone is already recorded with that email address.' } };
  }

  await logActivity({
    actorId: admin.id,
    actorName: admin.name,
    action: 'user.create',
    entityType: 'person',
    summary: `${admin.name} created the account for ${data.name} (${data.role})`,
  });

  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');

  // Named, and explicit about the password, because an account created without
  // one looks broken from the table until you know that is a state.
  return {
    success: data.password
      ? `${data.name} can now sign in with ${data.email}.`
      : `${data.name} added. Set a password before they can sign in.`,
  };
}

export async function updateUserRole(personId: string, role: UserRole): Promise<void> {
  const admin = await authorize('user:manage');

  const [target] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!target) return;

  /*
   * Refuse to remove the last Super Admin.
   *
   * Demoting yourself when you are the only one leaves an installation with
   * nobody who can approve an indent or appoint a replacement — recoverable
   * only by running the seed script against the database. Cheap to prevent.
   */
  if (target.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
    const remaining = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.role, 'SUPER_ADMIN'));

    if (remaining.filter((r) => r.id !== personId).length === 0) return;
  }

  await db
    .update(people)
    .set({ role, departmentId: role === 'HOD' ? target.departmentId : null })
    .where(eq(people.id, personId));

  await logActivity({
    actorId: admin.id,
    actorName: admin.name,
    action: 'user.role_changed',
    entityType: 'person',
    entityId: personId,
    summary: `${admin.name} changed ${target.name} from ${target.role} to ${role}`,
  });

  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
}

/** Grant or withdraw one of the two extra decision rights. */
export async function setUserGrant(
  personId: string,
  grant: 'canApprove' | 'canReject',
  granted: boolean,
): Promise<void> {
  const admin = await authorize('user:manage');

  const [target] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!target) return;

  await db
    .update(people)
    .set(grant === 'canApprove' ? { canApprove: granted } : { canReject: granted })
    .where(eq(people.id, personId));

  await logActivity({
    actorId: admin.id,
    actorName: admin.name,
    action: 'user.update',
    entityType: 'person',
    entityId: personId,
    summary: `${admin.name} ${granted ? 'granted' : 'withdrew'} ${
      grant === 'canApprove' ? 'approve' : 'reject'
    } rights ${granted ? 'to' : 'from'} ${target.name}`,
  });

  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
}

export async function setUserActive(personId: string, isActive: boolean): Promise<void> {
  const admin = await authorize('user:manage');

  const [target] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!target) return;

  // Same reasoning as the role guard: never leave the installation with no
  // Super Admin who can sign in.
  if (!isActive && target.role === 'SUPER_ADMIN') {
    const others = await db
      .select({ id: people.id, isActive: people.isActive })
      .from(people)
      .where(eq(people.role, 'SUPER_ADMIN'));

    if (others.filter((o) => o.id !== personId && o.isActive).length === 0) return;
  }

  await db.update(people).set({ isActive }).where(eq(people.id, personId));

  // Disabling has to take effect now, not whenever their cookie happens to
  // lapse. getCurrentUser also rejects an inactive account, so this is belt
  // and braces — but it means their next click lands on the sign-in screen.
  if (!isActive) await destroyAllSessionsFor(personId);

  await logActivity({
    actorId: admin.id,
    actorName: admin.name,
    action: isActive ? 'user.enable' : 'user.disable',
    entityType: 'person',
    entityId: personId,
    summary: `${admin.name} ${isActive ? 'enabled' : 'disabled'} the account for ${target.name}`,
  });

  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
}

/**
 * Set somebody else's password.
 *
 * No current password is asked for — the admin does not know it, which is the
 * entire reason they are here. The account is flagged to change it at next
 * sign-in, and every session it holds is ended.
 */
export async function resetUserPassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await authorize('user:manage');
  } catch (err) {
    return refuse(err);
  }

  const parsed = resetPasswordSchema.safeParse(
    formValues(formData, ['personId', 'password', 'confirmPassword']),
  );

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const [target] = await db
    .select()
    .from(people)
    .where(eq(people.id, parsed.data.personId))
    .limit(1);

  if (!target) return { error: 'That account no longer exists.' };

  await db
    .update(people)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: true,
    })
    .where(eq(people.id, target.id));

  await destroyAllSessionsFor(target.id);

  await logActivity({
    actorId: admin.id,
    actorName: admin.name,
    action: 'user.password_reset',
    entityType: 'person',
    entityId: target.id,
    summary: `${admin.name} reset the password for ${target.name}`,
  });

  revalidatePath('/admin/users');
  return { ok: true };
}
