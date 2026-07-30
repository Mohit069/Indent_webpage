import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db } from '../src/db';
import {
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
