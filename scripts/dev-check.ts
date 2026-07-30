import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db';
import {
  counters,
  departments,
  indentEvents,
  indentLines,
  indents,
  items,
  people,
  uoms,
} from '../src/db/schema';
import { hashLines } from '../src/lib/indent-no';

/*
 * Development smoke check, over real HTTP against the running dev server.
 *
 * There is no authentication, so there is no session to forge — every page is
 * fetched exactly as a browser would, with no cookie at all. That is the point
 * of the first group of checks: nothing redirects to a login, because there
 * isn't one.
 *
 * Run with the dev server up:  npm run check
 */

const BASE = process.env.CHECK_BASE_URL ?? 'http://localhost:3000';

/*
 * The fixture is tagged with a name no real requester would have, and the
 * cleanup deletes only rows carrying it.
 *
 * It used to use a plausible name ("Ramesh Kumar") and delete every indent
 * matching it, which quietly wiped real data that happened to share the name.
 * A test that can destroy production-shaped rows is a hazard, not a test.
 */
const FIXTURE_REQUESTER = 'ZZ-CHECK-FIXTURE (safe to delete)';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/*
 * `body` is the visible document, with <script> contents removed.
 *
 * Next.js inlines a serialised copy of the React tree into <script> tags for
 * client-side navigation, and that copy includes segments the layout chose not
 * to render. Asserting against the raw HTML therefore finds strings nobody can
 * see — which is how "it does not silently pick someone" started passing text
 * from the indents page while the screen showed the setup question.
 *
 * Every check here is about what a person sees, so strip the payload once and
 * let all of them work on the same honest string. `raw` is kept for anything
 * that genuinely needs the wire format.
 */
async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const raw = res.status < 300 ? await res.text() : '';
  const body = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  return { status: res.status, location: res.headers.get('location'), body, raw };
}

async function main() {
  console.log(`\nChecking ${BASE}\n`);

  const [maint] = await db
    .select()
    .from(departments)
    .where(eq(departments.name, 'Maintenance'))
    .limit(1);
  const [nos] = await db.select().from(uoms).where(eq(uoms.code, 'NOS')).limit(1);
  const [bearing] = await db.select().from(items).where(eq(items.code, 'BRG-6205')).limit(1);
  const everyone = await db.select().from(people).orderBy(people.name);

  if (!maint || !nos || !bearing || everyone.length === 0) {
    console.log('  Seed data missing — run `npm run db:seed` first.');
    process.exit(1);
  }

  const first = everyone[0];
  const second = everyone[1] ?? everyone[0];

  const asFirst = `indent_acting_as=${first.id}`;
  const asSecond = `indent_acting_as=${second.id}`;

  // --- open access --------------------------------------------------------
  console.log('No sign-in anywhere');
  const root = await get('/');
  check('/ goes straight to the indents', root.status === 307 && root.location === '/indents',
    `status ${root.status}, location ${root.location}`);

  const login = await get('/login');
  check('there is no login page any more', login.status === 404, `status ${login.status}`);

  for (const path of ['/indents', '/indents/new', '/admin', '/admin/people']) {
    const r = await get(path, asFirst);
    check(`${path} opens with no password`, r.status === 200, `status ${r.status}`);
  }

  for (const gone of ['/queue', '/triage']) {
    const r = await get(gone, asFirst);
    check(`${gone} has been removed`, r.status === 404, `status ${r.status}`);
  }

  // --- the new indent form ------------------------------------------------
  console.log('\nThe new indent form');
  const form = await get('/indents/new', asFirst);

  check('the button says Send for approval', form.body.includes('Send for approval'));
  check('there is no separate save-a-draft step', !form.body.includes('Save draft'));
  check('the department reference field is gone',
    !form.body.includes('Department reference'));

  /*
   * The unit is a text input with suggestions, not a select. Checked on the
   * markup because it is the difference the user asked for: a <select> can only
   * offer what is already in the master, and that was sending people back to
   * paper for anything unusual.
   */
  const deptInput = /<input[^>]*name="departmentName"/.test(form.body);
  const deptSelect = /<select[^>]*name="department/.test(form.body);
  check('the department is typed, not chosen', deptInput && !deptSelect);
  check('existing departments are offered as suggestions',
    form.body.includes('id="department-names"') && form.body.includes(`value="${maint.name}"`));

  const uomInput = /<input[^>]*aria-label="Unit for row 1"/.test(form.body);
  const uomSelect = /<select[^>]*aria-label="Unit for row 1"/.test(form.body);
  check('the unit is typed, not chosen', uomInput && !uomSelect);
  check('previously used units are still offered as suggestions',
    form.body.includes('<datalist') && form.body.includes(`value="${nos.code}"`));

  /*
   * Same for the item name. The catalog dropdown — the one whose first option
   * read "Not in the list — type below" — is gone; the master now reaches the
   * form as typeahead on the name box instead.
   */
  const itemInput = /<input[^>]*aria-label="Item name for row 1"/.test(form.body);
  check('the item name is typed, not chosen', itemInput);
  check('the catalog dropdown is gone', !form.body.includes('Not in the list'));
  check('no select is left in an item row',
    !/<select[^>]*aria-label="Item for row/.test(form.body));
  check('the item master is offered as suggestions',
    form.body.includes(`value="${bearing.name}"`));

  for (const label of [
    'ASAP',
    'Level 1 — within a week',
    'Level 2 — within 2 weeks',
    'Level 3 — within 3 weeks',
  ]) {
    check(`priority offers “${label}”`, form.body.includes(label));
  }
  check('and nothing from the old three-value scale',
    !/>(Normal|Urgent|Critical)</.test(form.body));

  // --- permissions on the screen ------------------------------------------
  console.log('\nWho is shown the decision buttons');

  /*
   * Withdraw the approve permission from the person this "browser" is set to,
   * and confirm the button stops being offered. Restored immediately after.
   *
   * The server refuses the action independently — that is what actually holds
   * the line, since a hidden button stops nobody who posts directly.
   */
  const before = { canApprove: first.canApprove, canReject: first.canReject };

  await db
    .update(people)
    .set({ canApprove: false, canReject: false })
    .where(eq(people.id, first.id));

  const asPowerless = await get('/indents', asFirst);
  check('someone with no permissions is offered no Approve',
    !asPowerless.body.includes('>Approve<'));
  check('nor Reject', !asPowerless.body.includes('>Reject<'));
  check('and is told why rather than left guessing',
    asPowerless.body.includes('not set up to decide indents'));

  await db
    .update(people)
    .set({ canApprove: true, canReject: false })
    .where(eq(people.id, first.id));

  const asApprover = await get('/indents', asFirst);
  check('an approver is offered Approve', asApprover.body.includes('>Approve<'));
  check('but not Reject', !asApprover.body.includes('>Reject<'));

  await db.update(people).set(before).where(eq(people.id, first.id));

  const restored = await get('/indents', asFirst);
  check('permissions restored', restored.body.includes('>Approve<'));

  // --- the real submit, over HTTP -----------------------------------------
  console.log('\nSending an indent for approval, end to end');

  /*
   * This posts the actual form to the actual server action and then looks in
   * the database for the row.
   *
   * It exists because everything else in this file reads rendered HTML, and
   * everything in verify.ts hands hand-built objects to the schema — so both
   * suites passed green while the real form was refusing to submit. The bug was
   * in the one seam neither covered: FormData answers `null` for a field that
   * is no longer on the page, and Zod's `.optional()` rejects null, so a field
   * removed from the UI came back as a required-field error.
   *
   * No action id is hardcoded. Next.js renders $ACTION_* hidden inputs into the
   * form for browsers without JavaScript; carrying those over is exactly what
   * such a browser does, and it survives the ids changing on every build.
   *
   * It is dated into a far-future financial year on purpose. Numbers are issued
   * per financial year, so this gets its own counter and cannot burn a number
   * out of the real sequence. Both the indent and that counter are removed
   * afterwards.
   */
  const FUTURE_DATE = '2099-04-01';
  const FUTURE_FY = '99-00';

  const unescapeHtml = (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x27;/g, "'");

  async function cleanUpProbe() {
    const rows = await db
      .select({ id: indents.id })
      .from(indents)
      .where(eq(indents.requesterName, FIXTURE_REQUESTER));
    for (const r of rows) await db.delete(indents).where(eq(indents.id, r.id));
    await db.delete(counters).where(eq(counters.fy, FUTURE_FY));
  }

  await cleanUpProbe();

  const formPage = await get('/indents/new', asFirst);
  const submission = new FormData();

  let actionFields = 0;
  for (const m of formPage.raw.matchAll(
    /<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?\s*\/>/g,
  )) {
    submission.set(m[1], m[2] === undefined ? '' : unescapeHtml(m[2]));
    actionFields++;
  }

  check('the form can be submitted without JavaScript', actionFields > 0,
    `${actionFields} action fields found`);

  submission.set('indentDate', FUTURE_DATE);
  // Typed by name, in the wrong case on purpose — it must land on the existing
  // department rather than creating a second one.
  submission.set('departmentName', maint.name.toLowerCase());
  submission.set('requesterName', FIXTURE_REQUESTER);
  // Left blank deliberately — all three are optional, and the previous bug was
  // precisely about fields that are not filled in.
  submission.set('requesterDesignation', '');
  submission.set('expectedDate', '');
  submission.set('purpose', '');
  submission.set('priority', 'LEVEL_1');
  submission.set(
    'lines',
    JSON.stringify([
      { customDescription: 'End-to-end probe item', uomCode: '', requiredQty: '3' },
    ]),
  );

  const sent = await fetch(`${BASE}/indents/new`, {
    method: 'POST',
    headers: { cookie: asFirst },
    body: submission,
    redirect: 'manual',
  });

  const sentTo = sent.headers.get('location') ?? '';
  check('it is accepted', sent.status === 303, `status ${sent.status}`);
  check('and confirms it was submitted', sentTo.includes('decided=submit'), sentTo);

  const [saved] = await db
    .select()
    .from(indents)
    .where(eq(indents.requesterName, FIXTURE_REQUESTER))
    .limit(1);

  check('the indent is in the database', Boolean(saved));

  if (saved) {
    check('it was given a number', (saved.indentNo ?? '').includes(FUTURE_FY),
      saved.indentNo ?? 'none');
    check('it is waiting for approval', saved.status === 'PENDING_APPROVAL',
      saved.status);
    check('the priority it was sent with was kept', saved.priority === 'LEVEL_1',
      saved.priority);
    check('a blank designation was stored, not refused',
      saved.requesterDesignation === '');
    check('the typed department resolved to the existing row, whatever the case',
      saved.departmentId === maint.id);

    const departmentCount = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.name, maint.name));
    check('and did not create a duplicate department', departmentCount.length === 1);

    const savedLines = await db
      .select({ description: indentLines.customDescription, uom: uoms.code, qty: indentLines.requiredQty })
      .from(indentLines)
      .innerJoin(uoms, eq(indentLines.uomId, uoms.id))
      .where(eq(indentLines.indentId, saved.id));

    check('its item was written', savedLines.length === 1);
    check('with the description typed', savedLines[0]?.description === 'End-to-end probe item');
    check('and a blank unit fell back to NOS', savedLines[0]?.uom === 'NOS',
      savedLines[0]?.uom);

    const history = await db
      .select()
      .from(indentEvents)
      .where(eq(indentEvents.indentId, saved.id))
      .orderBy(indentEvents.createdAt);

    check('the history records it being created then submitted',
      history.map((e) => e.stage).join(',') === 'CREATE,SUBMIT',
      history.map((e) => e.stage).join(','));
    check('and the submitted state is hashed for tamper detection',
      Boolean(history.at(-1)?.linesHash));

    // --- rejecting it, and the permission that guards that ----------------
    console.log('\nRejecting, and the permission behind it');

    /*
     * Reject is now a plain form rather than a dialog, so it can be posted the
     * way a browser without JavaScript posts it — which finally makes the
     * server-side permission check testable over HTTP rather than only by
     * reading the code.
     *
     * The form fields are lifted once, while the button is still being shown.
     * Posting them after the permission is withdrawn is exactly the bypass the
     * check exists to stop: the interface has taken the button away, and the
     * request arrives regardless.
     */
    const detail = await get(`/indents/${saved.id}`, asFirst);
    const rejectForm = new FormData();
    let rejectFields = 0;
    for (const m of detail.raw.matchAll(
      /<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?\s*\/>/g,
    )) {
      rejectForm.set(m[1], m[2] === undefined ? '' : unescapeHtml(m[2]));
      rejectFields++;
    }
    rejectForm.set('indentId', saved.id);
    rejectForm.set('action', 'reject');
    rejectForm.set('returnTo', '/indents');

    check('Reject is a form, postable without JavaScript', rejectFields > 0,
      `${rejectFields} action fields`);
    check('and it asks for no reason', !detail.body.includes('name="note"'));

    /*
     * Not asserted here: that posting this form actually rejects the indent.
     *
     * The attempt is written up in the README. Posting it back — verbatim, and
     * with the permission granted — is answered by Next.js with "Failed to find
     * Server Action", so the request never reaches transitionIndent. The same
     * approach works for saveIndent on /indents/new, so this is not simply a
     * broken harness, and until it is understood a check here would report
     * "the server refused it" for a request the server never ran. That reads
     * as a passing permission test and is nothing of the kind.
     *
     * What is asserted above is only what was actually observed: the form is
     * rendered, and it carries no field for a reason.
     */
  }

  await cleanUpProbe();
  const leftover = await db
    .select({ id: indents.id })
    .from(indents)
    .where(eq(indents.requesterName, FIXTURE_REQUESTER));
  check('the probe cleans up after itself', leftover.length === 0);

  // --- device setup -------------------------------------------------------
  console.log('\nDevice identity');
  const fresh = await get('/indents');
  check('a new computer is asked who uses it', fresh.body.includes('Who uses this computer?'));
  check('it does not silently pick someone', !fresh.body.includes('New Indent'));

  const set = await get('/indents', asSecond);
  check('once set, the app opens normally', set.body.includes('New Indent'));
  check('the header shows the pinned name', set.body.includes(second.name));

  const garbage = await get('/indents', 'indent_acting_as=not-a-real-id');
  check('an unknown id re-asks rather than breaking',
    garbage.status === 200 && garbage.body.includes('Who uses this computer?'));

  // --- an indent through the whole workflow -------------------------------
  console.log('\nAn indent through the workflow');

  const prior = await db
    .select({ id: indents.id })
    .from(indents)
    .where(eq(indents.requesterName, FIXTURE_REQUESTER));
  for (const p of prior) await db.delete(indents).where(eq(indents.id, p.id));

  const [ind] = await db
    .insert(indents)
    .values({
      indentDate: new Date().toISOString().slice(0, 10),
      raisedById: first.id,
      requesterName: FIXTURE_REQUESTER,
      requesterDesignation: 'Shift Technician',
      departmentId: maint.id,
      purpose: 'Line 2 polishing head is seizing.',
      priority: 'ASAP',
      status: 'DRAFT',
    })
    .returning({ id: indents.id });

  await db.insert(indentLines).values([
    { indentId: ind.id, lineNo: 1, itemId: bearing.id, uomId: nos.id, balanceQty: '2', requiredQty: '6' },
    { indentId: ind.id, lineNo: 2, itemId: null, customDescription: 'V-belt B-52', uomId: nos.id, requiredQty: '4' },
  ]);

  const lines = await db.select().from(indentLines).where(eq(indentLines.indentId, ind.id));
  const signedHash = hashLines(lines);

  await db.insert(indentEvents).values({
    indentId: ind.id,
    stage: 'CREATE',
    toStatus: 'DRAFT',
    actorId: first.id,
    actorNameSnapshot: first.name,
    actorDesignationSnapshot: first.designation,
  });

  const draft = await get(`/indents/${ind.id}`, asFirst);
  check('draft detail renders', draft.status === 200);
  check('shows the catalog line', draft.body.includes('Deep groove ball bearing'));
  check('shows the free-text line', draft.body.includes('V-belt B-52'));
  check('offers Submit', draft.body.includes('Submit Indent'));
  check('drafts are visible to everyone',
    (await get('/indents?status=DRAFT', asSecond)).status === 200);

  // Submit
  await db
    .update(indents)
    .set({
      status: 'PENDING_PURCHASE',
      indentNo: 'MQ/IND/26-27/9001',
      fy: '26-27',
      submittedAt: new Date(),
    })
    .where(eq(indents.id, ind.id));
  await db.insert(indentEvents).values({
    indentId: ind.id,
    stage: 'SUBMIT',
    fromStatus: 'DRAFT',
    toStatus: 'PENDING_PURCHASE',
    actorId: first.id,
    actorNameSnapshot: first.name,
    actorDesignationSnapshot: first.designation,
    linesHash: signedHash,
  });

  const list = await get('/indents', asSecond);
  check('the submitted indent appears in the list', list.body.includes('MQ/IND/26-27/9001'));
  // Priority is a badge carrying a deadline. The list shows the level alone;
  // the full wording ("within a week") only fits on the indent's own page.
  check('the most urgent level is surfaced', list.body.includes('ASAP'));

  // --- approve / reject on the list ---------------------------------------
  console.log('\nApprove and Reject on the indents page');

  check('the list offers Approve on the row', list.body.includes('Approve'));
  check('the list offers Reject on the row', list.body.includes('Reject'));
  check('the list says a password is needed',
    list.body.includes('asks for the shared password'));

  const submitted = await get(`/indents/${ind.id}`, asSecond);
  check('the indent page offers Approve too', submitted.body.includes('Approve'));
  check('it no longer offers Submit', !submitted.body.includes('Submit Indent'));

  const draftRow = await get('/indents?status=DRAFT', asSecond);
  check('a draft gets no Approve button', !draftRow.body.includes('>Approve<'));

  const approvedOnly = await get('/indents?status=APPROVED', asSecond);
  check('an approved indent gets no further decision buttons',
    !approvedOnly.body.includes('>Reject<'));

  /*
   * The password itself is proved in scripts/verify.ts, which exercises
   * `checkActionPassword` — the same function transitionIndent calls before it
   * will move anything. It is not re-tested over HTTP here because invoking a
   * Next.js server action from outside the browser means scraping its generated
   * action id out of a client chunk, which breaks on every build.
   */

  // --- the confirmation people actually see -------------------------------
  console.log('\nConfirmation message');

  const no = encodeURIComponent('MQ/IND/26-27/9001');
  const approved = await get(`/indents?decided=approve&no=${no}`, asSecond);
  check('approving says "Approved"', approved.body.includes('Approved'));
  check('and names the indent', approved.body.includes('MQ/IND/26-27/9001'));

  const rejected = await get(`/indents?decided=reject&no=${no}`, asSecond);
  check('rejecting says "Rejected"', rejected.body.includes('Rejected'));

  const submittedFlash = await get(`/indents?decided=submit&no=${no}`, asSecond);
  check('submitting says "Submitted"', submittedFlash.body.includes('Submitted'));

  const detailFlash = await get(`/indents/${ind.id}?decided=approve&no=${no}`, asSecond);
  check('the confirmation also shows on the indent page',
    detailFlash.body.includes('It can now be procured'));

  const plain = await get('/indents', asSecond);
  check('no confirmation shows without a decision',
    !plain.body.includes('It can now be procured'));

  const bogus = await get('/indents?decided=nonsense&no=x', asSecond);
  check('an unknown outcome shows nothing rather than breaking',
    bogus.status === 200 && !bogus.body.includes('It can now be procured'));

  // --- tamper detection ---------------------------------------------------
  console.log('\nTamper detection');
  await db
    .update(indentLines)
    .set({ requiredQty: '600' })
    .where(and(eq(indentLines.indentId, ind.id), eq(indentLines.lineNo, 1)));

  const tampered = await get(`/indents/${ind.id}`, asSecond);
  check('warns the items changed after sign-off',
    tampered.body.includes('changed after this was signed off'));

  // --- print --------------------------------------------------------------
  console.log('\nPrint');
  const print = await get(`/indents/${ind.id}/print`, asSecond);
  check('print view renders', print.status === 200);
  check('carries the company header', print.body.toUpperCase().includes('MARUDHAR QUARTZ'));
  check('HOD box carries the recorded name', print.body.includes(first.name));
  check('unreached approval box reads Pending', print.body.includes('Pending'));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nCheck crashed:', err);
  process.exit(1);
});
