import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db';
import {
  activityLog,
  departments,
  indentEvents,
  indentLines,
  indents,
  notifications,
  people,
  sessions,
  uoms,
} from '../src/db/schema';

/*
 * Marking an indent completed, end to end, through the real HTTP endpoint.
 *
 * verify.ts proves the workflow table allows it and that rbac hands it to the
 * right roles. Neither of those posts anything: they run the policy in
 * isolation, and every bug this project has actually shipped lived in the gap
 * between a rule that was correct and a request that never reached it. Reject
 * passed every structural check for weeks while being completely broken.
 *
 * Two accounts are exercised on purpose. The Super Admin proves the happy path;
 * an HOD proves the permission was really granted rather than merely written
 * down — and neither proves the other, because they arrive through different
 * branches of the same check.
 *
 * Raises its own indent and deletes it afterwards. It must never touch a real
 * one: a previous script destroyed a genuine indent by deleting a number it had
 * not created.
 *
 * Needs the app running. Usage:  npm run check:complete [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const MARKER = 'ZZ-COMPLETE-CHECK (safe to delete)';

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

/** A session cookie for this person, issued exactly as createSession does: a
 *  random secret in the cookie, only its SHA-256 in the table. */
async function sessionFor(personId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    personId,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 600_000),
  });
  return token;
}

/**
 * The reference Next needs in order to invoke `transitionIndent` over HTTP.
 *
 * Harvested from a page rather than hardcoded, because it is a build-time
 * identifier that changes whenever the action's module does.
 *
 * It has to come from a page showing an action that does *not* ask for
 * confirmation — Reject on a pending indent. A confirmed action renders as a
 * plain `<button type="button">` that opens a dialog, and the `<form>` carrying
 * the reference only exists once React has opened it, so a confirmed action's
 * page contains no reference at all. That is a fact about how the dialog is
 * built, not about the action: the id identifies the server function, not the
 * indent, so one harvested here drives a post against any indent.
 *
 * This is also why Approve has never been exercised at this level either, and
 * why the first version of this script reported "no $ACTION reference" against
 * a page that was rendering the button perfectly well.
 */
async function harvestActionRef(url: string, cookie: string) {
  const html = await (await fetch(url, { headers: { cookie } })).text();
  return {
    id: html.match(/&quot;id&quot;:&quot;([a-f0-9]+)&quot;/)?.[1],
    key: html.match(/name="\$ACTION_KEY" value="([^"]*)"/)?.[1],
    html,
  };
}

/**
 * Post a transition the way the browser's dialog does.
 *
 * The `$ACTION_*` fields and the multipart body are how Next invokes a server
 * action over plain HTTP; the Origin header is its CSRF guard, and without it
 * the request is rejected before the action is reached.
 */
async function postTransition(
  url: string,
  cookie: string,
  ref: { id: string; key?: string },
  fields: Record<string, string>,
) {
  const form = new FormData();
  form.set('$ACTION_REF_1', '');
  form.set('$ACTION_1:0', JSON.stringify({ id: ref.id, bound: '$@1' }));
  form.set('$ACTION_1:1', '[{}]');
  if (ref.key) form.set('$ACTION_KEY', ref.key);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);

  const res = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, origin: BASE },
    body: form,
  });
  return { status: res.status };
}

/**
 * Remove the throwaway HOD and everything that points at it.
 *
 * `activity_log.actor_id` is a real foreign key to `people` — deliberately, so
 * that somebody who approved a purchase cannot be deleted out from under the
 * record of them approving it. That is the right behaviour and the reason this
 * has to be a sequence rather than one delete: the rows referring to the
 * fixture have to go before the fixture can.
 *
 * Scoped to one address that no real account can hold. Run at the start as well
 * as the end, because a run that dies midway leaves the person behind and the
 * next run would otherwise fail on the leftover rather than on anything real.
 */
async function purgeFixturePerson(email: string) {
  const [existing] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.email, email))
    .limit(1);
  if (!existing) return;

  await db.delete(sessions).where(eq(sessions.personId, existing.id));
  await db.delete(notifications).where(eq(notifications.personId, existing.id));
  await db.delete(activityLog).where(eq(activityLog.actorId, existing.id));
  await db.delete(people).where(eq(people.id, existing.id));
}

async function statusOf(id: string) {
  const [row] = await db.select().from(indents).where(eq(indents.id, id)).limit(1);
  return row?.status;
}

async function closeEvents(id: string) {
  return db
    .select()
    .from(indentEvents)
    .where(and(eq(indentEvents.indentId, id), eq(indentEvents.stage, 'CLOSE')));
}

async function main() {
  console.log(`\n  against ${BASE}\n`);

  const [admin] = await db
    .select()
    .from(people)
    .where(eq(people.role, 'SUPER_ADMIN'))
    .limit(1);
  const [dept] = await db.select().from(departments).limit(1);
  const [nos] = await db.select().from(uoms).where(eq(uoms.code, 'NOS')).limit(1);

  if (!admin || !dept || !nos) {
    console.log('\n  Needs a Super Admin, a department and a NOS unit. Run db:seed first.\n');
    process.exit(1);
  }

  // Anything a previous run left behind, matched on its own marker.
  await db.delete(indents).where(eq(indents.requesterName, MARKER));

  /*
   * A throwaway HOD, created here rather than borrowed from the real accounts.
   * Marking somebody's live account as the actor on a test transition would put
   * their name in an append-only history that is never cleaned up.
   */
  const hodEmail = `zz-complete-check@example.invalid`;
  await purgeFixturePerson(hodEmail);
  const [hod] = await db
    .insert(people)
    .values({
      name: 'ZZ Complete Check (fixture)',
      designation: 'Fixture HOD',
      email: hodEmail,
      role: 'HOD',
      departmentId: dept.id,
      mustChangePassword: false,
    })
    .returning({ id: people.id });

  const originalFlag = admin.mustChangePassword;
  await db
    .update(people)
    .set({ mustChangePassword: false })
    .where(eq(people.id, admin.id));

  // Every indent this script creates, so the cleanup can name exactly what it
  // is allowed to remove from the audit trail and nothing beyond it.
  const fixtureIds: string[] = [];

  const makeFixture = async (status: 'APPROVED' | 'PENDING_APPROVAL') => {
    const [row] = await db
      .insert(indents)
      .values({
        indentDate: new Date().toISOString().slice(0, 10),
        requesterName: MARKER,
        requesterDesignation: 'Fixture',
        departmentId: dept.id,
        status,
        priority: 'LEVEL_3',
        submittedAt: new Date(),
        approvedAt: status === 'APPROVED' ? new Date() : null,
      })
      .returning({ id: indents.id });

    await db.insert(indentLines).values({
      indentId: row.id,
      lineNo: 1,
      customDescription: 'Fixture item',
      uomId: nos.id,
      requiredQty: '1',
    });
    fixtureIds.push(row.id);
    return row.id;
  };

  const adminToken = await sessionFor(admin.id);
  const hodToken = await sessionFor(hod.id);

  try {
    /*
     * The action reference, taken from a pending indent because that is the one
     * page rendering an unconfirmed action — see harvestActionRef. Everything
     * below posts with it.
     */
    const pending = await makeFixture('PENDING_APPROVAL');
    const harvested = await harvestActionRef(
      `${BASE}/admin/indents/${pending}`,
      `indent_session=${adminToken}`,
    );
    check('an action reference could be read from a pending indent',
      Boolean(harvested.id), 'the page rendered no server-action form at all');
    if (!harvested.id) return;
    const ref = { id: harvested.id, key: harvested.key };

    // --- the happy path, as the approving authority --------------------------
    const approved = await makeFixture('APPROVED');
    const adminCookie = `indent_session=${adminToken}`;
    const url = `${BASE}/admin/indents/${approved}`;

    const page = await (await fetch(url, { headers: { cookie: adminCookie } })).text();
    check('the approved indent offers Mark completed', /Mark completed/.test(page));
    check('and does not offer Approve any more', !/>Approve</.test(page));

    const r1 = await postTransition(url, adminCookie, ref, {
      indentId: approved,
      action: 'complete',
      returnTo: `/admin/indents/${approved}`,
    });
    check('the post was accepted, not refused as a bad action',
      r1.status === 303 || r1.status === 200, String(r1.status));
    check('a Super Admin can complete it', (await statusOf(approved)) === 'CLOSED',
      String(await statusOf(approved)));

    const events = await closeEvents(approved);
    check('exactly one CLOSE event was written', events.length === 1, String(events.length));
    check('and it carries the name that will print on the sheet',
      events[0]?.actorNameSnapshot === admin.name, events[0]?.actorNameSnapshot);
    check('recorded as coming from APPROVED', events[0]?.fromStatus === 'APPROVED');

    /*
     * The one-way door, tested against the running server rather than the
     * table. A second post has to be refused by the action itself — the button
     * being gone from the page is not a control.
     */
    await postTransition(url, adminCookie, ref, {
      indentId: approved,
      action: 'complete',
      returnTo: `/admin/indents/${approved}`,
    });
    check('completing twice writes nothing more',
      (await closeEvents(approved)).length === 1);

    // --- the HOD, who is the person actually standing at the store -----------
    const hodCookie = `indent_session=${hodToken}`;
    const forHod = await makeFixture('APPROVED');
    await postTransition(`${BASE}/indents/${forHod}`, hodCookie, ref, {
      indentId: forHod,
      action: 'complete',
      returnTo: `/indents/${forHod}`,
    });
    check('an HOD can complete one too', (await statusOf(forHod)) === 'CLOSED',
      String(await statusOf(forHod)));

    /*
     * And the grant stops there. An HOD posting `approve` must be refused by
     * the server, not merely find the button missing — the whole separation
     * between requesting and authorising rests on this one check.
     */
    const unapproved = await makeFixture('PENDING_APPROVAL');
    const rApprove = await postTransition(`${BASE}/indents/${unapproved}`, hodCookie, ref, {
      indentId: unapproved,
      action: 'approve',
      returnTo: `/indents/${unapproved}`,
    });
    /*
     * The status assertions below are only worth anything if the request
     * actually reached the action. An earlier version of this script "passed"
     * these three while never sending a single post — a refusal and a request
     * that was never made look identical from the database side.
     */
    check('the refused approve was a real request', rApprove.status !== 0,
      String(rApprove.status));
    check('but an HOD still cannot approve one',
      (await statusOf(unapproved)) === 'PENDING_APPROVAL',
      String(await statusOf(unapproved)));

    // Nor jump the queue: completing something nobody approved would leave a
    // finished indent with no authorisation anywhere in its history.
    const rJump = await postTransition(`${BASE}/indents/${unapproved}`, hodCookie, ref, {
      indentId: unapproved,
      action: 'complete',
      returnTo: `/indents/${unapproved}`,
    });
    check('the queue-jump was a real request too', rJump.status !== 0, String(rJump.status));
    check('nor complete one that was never approved',
      (await statusOf(unapproved)) === 'PENDING_APPROVAL',
      String(await statusOf(unapproved)));
    check('and no CLOSE event was written for it',
      (await closeEvents(unapproved)).length === 0);

    // --- signed out ----------------------------------------------------------
    const anon = await fetch(`${BASE}/indents/${forHod}`, { redirect: 'manual' });
    check('and a signed-out request cannot even see the page',
      anon.status === 307 && anon.headers.get('location') === '/login',
      `${anon.status} -> ${anon.headers.get('location')}`);
  } finally {
    /*
     * Order matters, and it is dictated by the audit trail refusing to let go.
     *
     * `activity_log.actor_id` is a real foreign key to `people`, which is the
     * point — a person who approved something cannot be deleted out from under
     * the record of them approving it. So the fixture's own log rows go first,
     * scoped to the indents this script created, and nothing else is touched:
     * the log is evidence, and a cleanup that reached past its own fixtures
     * would be quietly destroying some of it.
     *
     * The same constraint is why the real Super Admin's rows are cleared by
     * entity rather than by actor. They refer to indents that no longer exist,
     * and a genuine one of theirs must never be caught by the same delete.
     */
    for (const id of fixtureIds) {
      await db.delete(activityLog).where(eq(activityLog.entityId, id));
      await db.delete(notifications).where(eq(notifications.indentId, id));
    }

    await db.delete(indents).where(eq(indents.requesterName, MARKER));
    await db.delete(sessions).where(eq(sessions.personId, admin.id));
    await purgeFixturePerson(hodEmail);

    await db
      .update(people)
      .set({ mustChangePassword: originalFlag })
      .where(eq(people.id, admin.id));
    console.log('\n  fixtures removed, state restored');
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
