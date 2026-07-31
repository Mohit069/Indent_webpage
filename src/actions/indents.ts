'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  counters,
  departments,
  indentEvents,
  indentLines,
  indents,
  uoms,
} from '@/db/schema';
import type { IndentStatus } from '@/db/schema';
import { indentInputFromForm, indentSchema, transitionSchema } from '@/lib/validation';
import { actorSnapshot, getActor } from '@/lib/actor';
import { financialYear, formatIndentNo, hashLines } from '@/lib/indent-no';
import {
  findTransition,
  isEditable,
  requiredPermission,
  type TransitionRule,
} from '@/lib/workflow';
import { can } from '@/lib/rbac';
import { checkActionPassword } from '@/lib/action-password';
import { logActivity } from '@/lib/activity';
import { notifyDecision, notifySubmitted } from '@/lib/notify';

/*
 * Actions.
 *
 * No authentication and no permission checks — anyone who can reach the page
 * can do any of this. What is still enforced is the *shape* of the work: the
 * validation schema, the workflow's legal transitions, and the database's own
 * constraints. Those are about keeping the data coherent, not about keeping
 * people out.
 */

import type { ActionResult } from '@/lib/action-state';

export type IndentActionState = ActionResult;

function collectFieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
  return fieldErrors;
}

type Actor = Awaited<ReturnType<typeof actorSnapshot>>;

/**
 * Map typed unit codes onto rows in the uoms master, adding any that are new.
 *
 * The line editor lets people type the unit instead of picking one, so the
 * master has to accept whatever comes back. Codes are already upper-cased by
 * the schema, and `uoms.code` is unique, so `onConflictDoNothing` plus a
 * re-read handles two people inventing the same unit at the same moment.
 */
async function resolveUomIds(codes: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(codes)];
  const found = new Map<string, string>();
  if (wanted.length === 0) return found;

  // Deliberately not filtered by isActive: a retired code still has to resolve,
  // and typing it is a clear sign it is wanted again.
  const existing = await db.select().from(uoms).where(inArray(uoms.code, wanted));
  for (const u of existing) {
    found.set(u.code, u.id);
    if (!u.isActive) {
      await db.update(uoms).set({ isActive: true }).where(eq(uoms.id, u.id));
    }
  }

  for (const code of wanted.filter((c) => !found.has(c))) {
    const [created] = await db
      .insert(uoms)
      .values({ code, name: code })
      .onConflictDoNothing()
      .returning({ id: uoms.id });

    if (created) {
      found.set(code, created.id);
      continue;
    }

    const [raced] = await db.select().from(uoms).where(eq(uoms.code, code)).limit(1);
    if (raced) found.set(code, raced.id);
  }

  return found;
}

/*
 * Words that carry no meaning in a department name, so they never contribute
 * an initial: "Utilities & Boiler House" should read UBH, not UABH.
 */
const NOISE_WORDS = new Set(['AND', 'OF', 'THE', 'FOR', '&']);

/**
 * A short code for a department created from a typed name.
 *
 * Codes are unique and appear in reports, so they are derived rather than
 * asked for — nobody raising an indent should have to invent one.
 *
 * Initials for a multi-word name, the opening letters for a single word. A
 * plain truncation was the first attempt and produced "UTILITIE" for
 * "Utilities & Boiler House", which reads as a word cut off mid-air rather
 * than as an abbreviation.
 */
function deriveDepartmentCode(name: string): string {
  const words = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w));

  if (words.length === 0) return 'DEPT';

  const code =
    words.length > 1
      ? words.map((w) => w[0]).join('').slice(0, 6)
      : words[0].slice(0, 5);

  // The column is unique and non-empty; a single letter is too collision-prone.
  return code.length >= 2 ? code : `${code}X`;
}

/**
 * Map a typed department name onto a row in the departments master, adding it
 * if it is new.
 *
 * Matched case-insensitively, so "maintenance" lands on the existing
 * "Maintenance" rather than creating a second one. The column stays a real
 * foreign key, so filtering and counting by department keep working.
 *
 * Returns null only if a code could not be found that is free — see the loop.
 */
async function resolveDepartmentId(name: string): Promise<string | null> {
  const byName = async () =>
    (
      await db
        .select({ id: departments.id, isActive: departments.isActive })
        .from(departments)
        .where(sql`lower(${departments.name}) = lower(${name})`)
        .limit(1)
    )[0];

  const existing = await byName();
  if (existing) {
    // Typing a retired department is a clear sign it is wanted again.
    if (!existing.isActive) {
      await db
        .update(departments)
        .set({ isActive: true })
        .where(eq(departments.id, existing.id));
    }
    return existing.id;
  }

  const base = deriveDepartmentCode(name);

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = attempt === 0 ? base : `${base.slice(0, 9)}${attempt + 1}`;

    const [created] = await db
      .insert(departments)
      .values({ name, code })
      .onConflictDoNothing()
      .returning({ id: departments.id });

    if (created) return created.id;

    /*
     * The insert conflicted. Either someone created this same department a
     * moment ago — in which case use theirs — or the derived code is taken by
     * a different department, and the next attempt tries a suffixed one.
     */
    const raced = await byName();
    if (raced) return raced.id;
  }

  return null;
}

/**
 * Write the state change and its history row.
 *
 * Shared by `transitionIndent` (the buttons) and `saveIndent` (Send for
 * approval, which submits in the same step it saves). Extracted so the number
 * is issued in exactly one place — two copies of the counter logic is how a
 * sequence develops duplicates.
 *
 * Callers are responsible for authorisation. This function performs no password
 * check, because one of its two callers does not need one.
 */
async function commitTransition({
  indent,
  rule,
  actor,
}: {
  indent: typeof indents.$inferSelect;
  rule: TransitionRule;
  actor: Actor;
}): Promise<{ issuedNumber: string | null }> {
  const lines = await db
    .select()
    .from(indentLines)
    .where(eq(indentLines.indentId, indent.id));

  const linesHash = hashLines(lines);
  let issuedNumber: string | null = null;

  await db.transaction(async (tx) => {
    const patch: Partial<typeof indents.$inferInsert> = {
      status: rule.to as IndentStatus,
      updatedAt: new Date(),
    };

    if (rule.action === 'submit' && !indent.indentNo) {
      /*
       * Issue the serial number here and nowhere else.
       *
       * The counter row is locked FOR UPDATE inside this transaction, so two
       * people pressing the button in the same second queue up rather than
       * collide. A number is issued on submit, never on draft creation —
       * otherwise every abandoned draft would burn one and the sequence would
       * develop the same silent gaps as the paper book.
       */
      const fy = financialYear(new Date(indent.indentDate));
      const prefix = process.env.INDENT_PREFIX ?? 'MQ/IND';

      await tx.insert(counters).values({ fy, prefix, lastValue: 0 }).onConflictDoNothing();

      const [counter] = await tx
        .select()
        .from(counters)
        .where(and(eq(counters.fy, fy), eq(counters.prefix, prefix)))
        .for('update');

      const next = counter.lastValue + 1;

      await tx
        .update(counters)
        .set({ lastValue: next })
        .where(and(eq(counters.fy, fy), eq(counters.prefix, prefix)));

      patch.indentNo = formatIndentNo(fy, next);
      patch.fy = fy;
      patch.submittedAt = new Date();
      issuedNumber = patch.indentNo;
    }

    if (rule.action === 'approve') patch.approvedAt = new Date();

    await tx.update(indents).set(patch).where(eq(indents.id, indent.id));

    await tx.insert(indentEvents).values({
      indentId: indent.id,
      stage: rule.stage,
      fromStatus: indent.status,
      toStatus: rule.to as IndentStatus,
      actorId: actor.id,
      actorNameSnapshot: actor.name,
      actorDesignationSnapshot: actor.designation,
      // Nothing writes a note any more; the column carries older ones only.
      note: null,
      linesHash,
    });
  });

  return { issuedNumber };
}

/*
 * `setActingAs` used to live here — it switched whose name went on the next
 * action by writing a cookie. Sign-in replaced it. Letting anyone choose to act
 * as Saurabh would defeat the point of restricting approval to him, so the
 * picker is gone rather than hidden.
 */

/**
 * Write the indent and send it for approval, in one step.
 *
 * The form has a single button. Saving a draft and then submitting it from a
 * second screen was two actions for what people think of as one, and the draft
 * in between had no purpose — nobody was reviewing it. The row is still written
 * as a DRAFT first and then transitioned, so the history reads Created then
 * Submitted exactly as it always did, and the number is still issued by the one
 * function allowed to issue numbers.
 *
 * Lines arrive as one JSON blob rather than indexed form fields, because the
 * line editor adds and removes rows on the client and index-based names go
 * stale the moment a middle row is deleted.
 */
export async function saveIndent(
  _prev: IndentActionState,
  formData: FormData,
): Promise<IndentActionState> {
  const indentId = formData.get('indentId');
  const rawLines = formData.get('lines');

  let parsedLines: unknown = [];
  try {
    parsedLines = JSON.parse(typeof rawLines === 'string' ? rawLines : '[]');
  } catch {
    return { error: 'The item rows could not be read. Please re-enter them.' };
  }

  const parsed = indentSchema.safeParse(indentInputFromForm(formData, parsedLines));

  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const data = parsed.data;
  const actor = await actorSnapshot();

  // Typed units, resolved against the master before any line is written.
  const uomIds = await resolveUomIds(data.lines.map((l) => l.uomCode));

  /*
   * Refuse rather than write a line with no unit.
   *
   * resolveUomIds only fails to produce an id if the insert and the follow-up
   * read both came back empty, which should not happen — but the column is NOT
   * NULL, so the alternative to checking is a 500 with the work lost.
   */
  const unresolved = data.lines.find((l) => !uomIds.has(l.uomCode));
  if (unresolved) {
    return {
      error: `Could not record the unit “${unresolved.uomCode}”. Nothing has been saved — try a different unit.`,
    };
  }

  const departmentId = await resolveDepartmentId(data.departmentName);
  if (!departmentId) {
    return {
      fieldErrors: {
        departmentName:
          'Could not record that department. Try a slightly different name.',
      },
    };
  }

  let targetId: string;

  if (typeof indentId === 'string' && indentId.length > 0) {
    const [existing] = await db
      .select()
      .from(indents)
      .where(eq(indents.id, indentId))
      .limit(1);

    if (!existing) return { error: 'That indent no longer exists.' };
    if (!isEditable(existing.status)) {
      return { error: 'This indent has been submitted and can no longer be edited.' };
    }

    await db
      .update(indents)
      .set({
        indentDate: data.indentDate,
        departmentId,
        requesterName: data.requesterName,
        // Optional on the form; the column is NOT NULL, so blank is stored as
        // an empty string rather than refused.
        requesterDesignation: data.requesterDesignation ?? '',
        purpose: data.purpose ?? null,
        expectedDate: data.expectedDate ?? null,
        priority: data.priority,
        updatedAt: new Date(),
      })
      .where(eq(indents.id, indentId));

    // Replace the lines wholesale — simpler than diffing, and the history lives
    // in indent_events, so nothing is lost by doing so.
    await db.delete(indentLines).where(eq(indentLines.indentId, indentId));
    targetId = indentId;
  } else {
    const [created] = await db
      .insert(indents)
      .values({
        indentDate: data.indentDate,
        raisedById: actor.id,
        requesterName: data.requesterName,
        // Optional on the form; the column is NOT NULL, so blank is stored as
        // an empty string rather than refused.
        requesterDesignation: data.requesterDesignation ?? '',
        departmentId,
        purpose: data.purpose ?? null,
        expectedDate: data.expectedDate ?? null,
        priority: data.priority,
        status: 'DRAFT',
      })
      .returning({ id: indents.id });

    targetId = created.id;

    await db.insert(indentEvents).values({
      indentId: targetId,
      stage: 'CREATE',
      fromStatus: null,
      toStatus: 'DRAFT',
      actorId: actor.id,
      actorNameSnapshot: actor.name,
      actorDesignationSnapshot: actor.designation,
    });
  }

  await db.insert(indentLines).values(
    data.lines.map((line, i) => ({
      indentId: targetId,
      lineNo: i + 1,
      /*
       * itemId is left to its default of null. The catalog dropdown that used
       * to set it is gone, so a line raised here is always free text; the
       * column stays for the rows that already point at an item.
       */
      customDescription: line.customDescription,
      uomId: uomIds.get(line.uomCode)!,
      balanceQty: line.balanceQty ?? null,
      requiredQty: line.requiredQty,
      remarks: line.remarks ?? null,
    })),
  );

  /*
   * Send it for approval in the same step.
   *
   * Re-read rather than reusing the row from above: the transition needs the
   * indent date and current status as the database has them, and on the create
   * path only the id came back from the insert.
   */
  const [saved] = await db.select().from(indents).where(eq(indents.id, targetId)).limit(1);
  const rule = findTransition('submit', saved.status);

  if (!rule) {
    // Nothing legal to do — leave it saved rather than losing the work.
    revalidatePath('/indents');
    redirect(`/indents/${targetId}`);
  }

  const { issuedNumber } = await commitTransition({ indent: saved, rule, actor });

  const number = saved.indentNo ?? issuedNumber ?? '';

  await logActivity({
    actorId: actor.id,
    actorName: actor.name,
    action: 'indent.submit',
    entityType: 'indent',
    entityId: targetId,
    summary: `${actor.name} raised ${number} for ${data.departmentName}`,
  });

  // Puts it in front of whoever can approve, and drives the sidebar badge.
  await notifySubmitted({
    indentId: targetId,
    indentNo: number,
    requesterName: data.requesterName,
    departmentName: data.departmentName,
  });

  /*
   * Drop the cached list before leaving, so the indent that was just raised is
   * on the page the redirect lands on rather than one refresh later. The list
   * is force-dynamic, but the router cache would otherwise serve the copy taken
   * before this indent existed.
   */
  revalidatePath('/indents');
  revalidatePath(`/indents/${targetId}`);
  revalidatePath('/admin', 'layout');

  /*
   * To the list, not to the indent itself.
   *
   * Raising an indent is a task that finishes: what you want next is to see it
   * sitting in the queue with the others, not to stare at the thing you just
   * typed. The number travels in the URL so the toast can name it.
   */
  redirect(`/indents?decided=submit&no=${encodeURIComponent(number)}`);
}

/**
 * Move an indent through the workflow.
 *
 * Every path through this function ends in an appended indent_events row —
 * that row is what fills the printed form's signature boxes.
 */
export async function transitionIndent(
  _prev: IndentActionState,
  formData: FormData,
): Promise<IndentActionState> {
  const parsed = transitionSchema.safeParse({
    indentId: formData.get('indentId'),
    action: formData.get('action'),
    password: formData.get('password'),
    returnTo: formData.get('returnTo'),
  });

  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { indentId, action, password, returnTo } = parsed.data;

  const [indent] = await db
    .select()
    .from(indents)
    .where(eq(indents.id, indentId))
    .limit(1);

  if (!indent) return { error: 'That indent no longer exists.' };

  const rule = findTransition(action, indent.status);
  if (!rule) {
    return {
      error: `This indent is ${indent.status.toLowerCase().replace('_', ' ')} — that action is not available.`,
    };
  }
  /*
   * The password gate, checked here and nowhere else that matters.
   *
   * The dialog asks for it in the browser, but a browser check is decoration —
   * anyone can post to a server action directly. This is the real gate, and it
   * runs before anything is written.
   */
  if (rule.requiresPassword && !checkActionPassword(password ?? '')) {
    return {
      fieldErrors: { password: 'Wrong password. Nothing has been changed.' },
    };
  }

  /*
   * The permission check, on the server, before anything is written.
   *
   * Hiding the buttons is a courtesy to the person looking at the screen; it is
   * not a control, because a server action is an HTTP endpoint and anyone can
   * post to it directly. This is where the answer is actually decided.
   *
   * Unlike the version this replaced, it is now a real restraint: the person is
   * whoever holds the session cookie, and that cannot be set by choosing a name
   * from a list.
   */
  const deciding = await getActor();
  const needed = requiredPermission(action);

  if (needed) {
    if (!deciding) return { error: 'You are not signed in.' };

    if (!can(deciding, needed)) {
      const verb = action === 'approve' ? 'approve' : 'reject';
      return {
        error: `${deciding.name} is not allowed to ${verb} indents. Someone with that permission has to do it, or it can be granted under Users.`,
      };
    }
  }

  const actor = await actorSnapshot();

  const lineCount = await db
    .select({ id: indentLines.id })
    .from(indentLines)
    .where(eq(indentLines.indentId, indentId));

  if (action === 'submit' && lineCount.length === 0) {
    return { error: 'Add at least one item before submitting.' };
  }

  const { issuedNumber } = await commitTransition({ indent, rule, actor });

  const number = indent.indentNo ?? issuedNumber ?? 'an indent';

  await logActivity({
    actorId: actor.id,
    actorName: actor.name,
    action:
      action === 'approve'
        ? 'indent.approve'
        : action === 'reject'
          ? 'indent.reject'
          : 'indent.submit',
    entityType: 'indent',
    entityId: indent.id,
    summary: `${actor.name} ${
      action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'submitted'
    } ${number}`,
  });

  if (action === 'approve' || action === 'reject') {
    await notifyDecision({
      indentId: indent.id,
      indentNo: number,
      raisedById: indent.raisedById,
      approved: action === 'approve',
      deciderName: actor.name,
    });
  }

  revalidatePath('/indents');
  revalidatePath(`/indents/${indentId}`);
  // The admin sidebar's pending badge and its lists read the same rows.
  revalidatePath('/admin', 'layout');

  /*
   * Say what happened, on the page they were already on.
   *
   * The status chip changing is easy to miss, and a dialog that just disappears
   * leaves you wondering whether the password was even accepted. The result is
   * carried in the URL so it survives the re-render that follows.
   */
  if (returnTo) {
    const number: string = indent.indentNo ?? issuedNumber ?? '';
    redirect(`${returnTo}?decided=${action}&no=${encodeURIComponent(number)}`);
  }

  // Stated outright, not implied by the absence of errors — see ActionResult.
  return { ok: true };
}

/** Deleting a draft is the only true delete. Anything submitted is withdrawn,
 *  not removed, so its number stays accounted for. */
export async function deleteDraft(indentId: string): Promise<void> {
  const [indent] = await db
    .select()
    .from(indents)
    .where(eq(indents.id, indentId))
    .limit(1);

  if (!indent || indent.status !== 'DRAFT') return;

  await db.delete(indents).where(eq(indents.id, indentId));
  revalidatePath('/indents');
  redirect('/indents');
}
