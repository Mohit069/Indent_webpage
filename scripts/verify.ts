import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { findTransition, TRANSITIONS } from '../src/lib/workflow';
import { checkActionPassword } from '../src/lib/action-password';
import { shouldCloseAfter } from '../src/lib/action-state';
import {
  indentInputFromForm,
  indentLineSchema,
  indentSchema,
  transitionSchema,
} from '../src/lib/validation';
import { describeMissing, labelForPath } from '../src/lib/form-summary';

/*
 * End-to-end verification, against real Postgres.
 *
 * PGlite is Postgres compiled to WebAssembly — the same query planner, the same
 * constraint enforcement, the same transaction semantics — so this exercises
 * the actual DDL and the actual concurrency behaviour without needing a server
 * installed. What passes here passes on the Postgres you deploy against.
 *
 * Run with: npx tsx scripts/verify.ts
 */

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const db = new PGlite();

  // -------------------------------------------------------------------------
  console.log('\nSchema');
  // -------------------------------------------------------------------------
  /*
   * Every migration, in order.
   *
   * This used to apply only the first file, so the schema being tested was the
   * one from day one and every migration after it was unverified — including
   * the data translation in 0001, which is exactly the kind of statement that
   * needs a rehearsal before it touches a real database.
   */
  const dir = join(process.cwd(), 'drizzle');
  const migrations = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  async function apply(file: string) {
    const sqlText = readFileSync(join(dir, file), 'utf8');
    // drizzle-kit separates statements with this sentinel.
    for (const statement of sqlText.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await db.exec(trimmed);
    }
  }

  await apply(migrations[0]);

  /*
   * Rehearse the priority translation on rows that actually carry the old
   * words, rather than running 0001 against an empty table where a broken
   * mapping would pass unnoticed. These rows are dropped again below.
   */
  await db.exec(`
    insert into departments (id, name, code)
      values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Migration fixture', 'MIGFIX');
    insert into indents (id, indent_date, requester_name, requester_designation,
                         department_id, status, priority)
    values
      ('aaaaaaa1-0000-4000-8000-000000000001', '2026-07-29', 'A', 'A',
       'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'DRAFT', 'CRITICAL'),
      ('aaaaaaa1-0000-4000-8000-000000000002', '2026-07-29', 'B', 'B',
       'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'DRAFT', 'URGENT'),
      ('aaaaaaa1-0000-4000-8000-000000000003', '2026-07-29', 'C', 'C',
       'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'DRAFT', 'NORMAL');
  `);

  for (const file of migrations.slice(1)) await apply(file);

  check(`all ${migrations.length} migrations applied`, migrations.length >= 2,
    migrations.join(', '));

  const translated = await db.query<{ id: string; priority: string }>(
    `select id, priority from indents order by id`,
  );
  const priorityOf = (n: number) =>
    translated.rows.find((r) => r.id.endsWith(`00${n}`))?.priority;

  check('CRITICAL became ASAP', priorityOf(1) === 'ASAP');
  check('URGENT became LEVEL_1', priorityOf(2) === 'LEVEL_1');
  check('NORMAL became LEVEL_3', priorityOf(3) === 'LEVEL_3');

  const newDefault = await db.query<{ column_default: string | null }>(
    `select column_default from information_schema.columns
      where table_name = 'indents' and column_name = 'priority'`,
  );
  check('new rows default to the least urgent level',
    (newDefault.rows[0]?.column_default ?? '').includes('LEVEL_3'),
    newDefault.rows[0]?.column_default ?? 'no default');

  await db.exec(
    `delete from indents where department_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
     delete from departments where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';`,
  );

  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema='public' order by table_name`,
  );
  check(
    'all 9 tables created',
    tables.rows.length === 9,
    `got ${tables.rows.length}: ${tables.rows.map((r) => r.table_name).join(', ')}`,
  );

  // -------------------------------------------------------------------------
  console.log('\nMasters');
  // -------------------------------------------------------------------------
  await db.exec(`
    insert into departments (id, name, code) values
      ('11111111-1111-1111-1111-111111111111', 'Maintenance', 'MAINT');
    insert into uoms (id, code, name) values
      ('22222222-2222-2222-2222-222222222222', 'NOS', 'Numbers');
    insert into people (id, name, designation) values
      ('33333333-3333-3333-3333-333333333333', 'Suresh Sharma', 'Head - Maintenance'),
      ('44444444-4444-4444-4444-444444444444', 'Anita Verma', 'Purchase Officer'),
      ('55555555-5555-5555-5555-555555555555', 'R. Mehta', 'Director');
    insert into items (id, code, name, default_uom_id) values
      ('66666666-6666-6666-6666-666666666666', 'BRG-6205', 'Ball bearing',
       '22222222-2222-2222-2222-222222222222');
  `);
  check('masters seeded', true);

  // -------------------------------------------------------------------------
  console.log('\nLine constraint: item OR free text, never both, never neither');
  // -------------------------------------------------------------------------
  await db.exec(`
    insert into indents (id, indent_date, raised_by_id, requester_name,
                         requester_designation, department_id, status)
    values ('77777777-7777-7777-7777-777777777777', '2026-07-29',
            '33333333-3333-3333-3333-333333333333', 'Ramesh Kumar', 'Technician',
            '11111111-1111-1111-1111-111111111111', 'DRAFT');
  `);

  async function tryInsertLine(label: string, cols: string): Promise<boolean> {
    try {
      await db.exec(`insert into indent_lines ${cols}`);
      return true;
    } catch {
      return false;
    }
  }

  const both = await tryInsertLine(
    'both',
    `(indent_id, line_no, item_id, custom_description, uom_id, required_qty)
     values ('77777777-7777-7777-7777-777777777777', 90,
             '66666666-6666-6666-6666-666666666666', 'typed too',
             '22222222-2222-2222-2222-222222222222', 1)`,
  );
  check('rejects a line naming both an item and a description', !both);

  const neither = await tryInsertLine(
    'neither',
    `(indent_id, line_no, uom_id, required_qty)
     values ('77777777-7777-7777-7777-777777777777', 91,
             '22222222-2222-2222-2222-222222222222', 1)`,
  );
  check('rejects a line naming neither', !neither);

  const zeroQty = await tryInsertLine(
    'zero',
    `(indent_id, line_no, custom_description, uom_id, required_qty)
     values ('77777777-7777-7777-7777-777777777777', 92, 'x',
             '22222222-2222-2222-2222-222222222222', 0)`,
  );
  check('rejects a required quantity of zero', !zeroQty);

  const good = await tryInsertLine(
    'catalog item',
    `(indent_id, line_no, item_id, uom_id, balance_qty, required_qty)
     values ('77777777-7777-7777-7777-777777777777', 1,
             '66666666-6666-6666-6666-666666666666',
             '22222222-2222-2222-2222-222222222222', 2, 6)`,
  );
  check('accepts a catalog line', good);

  const freeText = await tryInsertLine(
    'free text',
    `(indent_id, line_no, custom_description, uom_id, required_qty)
     values ('77777777-7777-7777-7777-777777777777', 2, 'V-belt B-52',
             '22222222-2222-2222-2222-222222222222', 4)`,
  );
  check('accepts a free-text line (the escape hatch)', freeText);

  // -------------------------------------------------------------------------
  console.log('\nSerial numbers');
  // -------------------------------------------------------------------------
  async function issueNumber(fy: string, prefix: string): Promise<string> {
    await db.exec('begin');
    await db.exec(
      `insert into counters (fy, prefix, last_value) values ('${fy}', '${prefix}', 0)
       on conflict do nothing`,
    );
    const res = await db.query<{ last_value: number }>(
      `select last_value from counters where fy='${fy}' and prefix='${prefix}' for update`,
    );
    const next = res.rows[0].last_value + 1;
    await db.exec(
      `update counters set last_value=${next} where fy='${fy}' and prefix='${prefix}'`,
    );
    await db.exec('commit');
    return `${prefix}/${fy}/${String(next).padStart(4, '0')}`;
  }

  const first = await issueNumber('26-27', 'MQ/IND');
  const second = await issueNumber('26-27', 'MQ/IND');
  const otherFy = await issueNumber('27-28', 'MQ/IND');

  check('first number formats as MQ/IND/26-27/0001', first === 'MQ/IND/26-27/0001', first);
  check('second number increments', second === 'MQ/IND/26-27/0002', second);
  check('a new financial year restarts at 0001', otherFy === 'MQ/IND/27-28/0001', otherFy);

  await db.exec(
    `update indents set indent_no='${first}', fy='26-27', status='PENDING_PURCHASE',
     submitted_at=now() where id='77777777-7777-7777-7777-777777777777'`,
  );

  let duplicate = false;
  try {
    await db.exec(`
      insert into indents (indent_no, indent_date, raised_by_id, requester_name,
                           requester_designation, department_id, status)
      values ('${first}', '2026-07-29', '33333333-3333-3333-3333-333333333333',
              'Someone Else', 'Fitter', '11111111-1111-1111-1111-111111111111', 'DRAFT')`);
    duplicate = true;
  } catch {
    duplicate = false;
  }
  check('the database refuses a duplicate indent number', !duplicate);

  // -------------------------------------------------------------------------
  console.log('\nWorkflow and audit trail');
  // -------------------------------------------------------------------------
  function hashLines(
    rows: { line_no: number; item_id: string | null; custom_description: string | null; uom_id: string; required_qty: string }[],
  ) {
    const canonical = rows
      .slice()
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) =>
        [l.line_no, l.item_id ?? '', l.custom_description ?? '', l.uom_id, l.required_qty].join(''),
      )
      .join('');
    return createHash('sha256').update(canonical).digest('hex');
  }

  const linesQ = await db.query<{
    line_no: number;
    item_id: string | null;
    custom_description: string | null;
    uom_id: string;
    required_qty: string;
  }>(
    `select line_no, item_id, custom_description, uom_id, required_qty
     from indent_lines where indent_id='77777777-7777-7777-7777-777777777777'
     order by line_no`,
  );
  const signedHash = hashLines(linesQ.rows);

  await db.exec(`
    insert into indent_events (indent_id, stage, from_status, to_status, actor_id,
      actor_name_snapshot, actor_designation_snapshot, lines_hash)
    values ('77777777-7777-7777-7777-777777777777', 'SUBMIT', 'DRAFT', 'PENDING_PURCHASE',
            '33333333-3333-3333-3333-333333333333', 'Suresh Sharma', 'Head - Maintenance',
            '${signedHash}');
  `);

  await db.exec(`
    update indents set status='PENDING_APPROVAL' where id='77777777-7777-7777-7777-777777777777';
    insert into indent_events (indent_id, stage, from_status, to_status, actor_id,
      actor_name_snapshot, actor_designation_snapshot, lines_hash)
    values ('77777777-7777-7777-7777-777777777777', 'PURCHASE_RECEIPT', 'PENDING_PURCHASE',
            'PENDING_APPROVAL', '44444444-4444-4444-4444-444444444444', 'Anita Verma',
            'Purchase Officer', '${signedHash}');

    update indents set status='APPROVED', approved_at=now() where id='77777777-7777-7777-7777-777777777777';
    insert into indent_events (indent_id, stage, from_status, to_status, actor_id,
      actor_name_snapshot, actor_designation_snapshot, lines_hash)
    values ('77777777-7777-7777-7777-777777777777', 'FINAL_APPROVAL', 'PENDING_APPROVAL',
            'APPROVED', '55555555-5555-5555-5555-555555555555', 'R. Mehta', 'Director',
            '${signedHash}');
  `);

  const events = await db.query<{ stage: string; actor_name_snapshot: string }>(
    `select stage, actor_name_snapshot from indent_events
     where indent_id='77777777-7777-7777-7777-777777777777' order by created_at, stage`,
  );
  check('three workflow events recorded', events.rows.length === 3, `got ${events.rows.length}`);
  check(
    'each event names who acted',
    events.rows.every((e) => e.actor_name_snapshot.length > 0),
  );

  // -------------------------------------------------------------------------
  console.log('\nTamper detection');
  // -------------------------------------------------------------------------
  await db.exec(
    `update indent_lines set required_qty = 60 where indent_id='77777777-7777-7777-7777-777777777777' and line_no=1`,
  );
  const afterQ = await db.query<{
    line_no: number;
    item_id: string | null;
    custom_description: string | null;
    uom_id: string;
    required_qty: string;
  }>(
    `select line_no, item_id, custom_description, uom_id, required_qty
     from indent_lines where indent_id='77777777-7777-7777-7777-777777777777' order by line_no`,
  );
  const afterHash = hashLines(afterQ.rows);
  check(
    'a quantity changed after approval no longer matches the signed hash',
    afterHash !== signedHash,
  );

  // -------------------------------------------------------------------------
  console.log('\nWorkflow shape');
  // -------------------------------------------------------------------------
  check('there are exactly three actions', TRANSITIONS.length === 3,
    TRANSITIONS.map((t) => t.action).join(', '));
  check('a draft can be submitted', Boolean(findTransition('submit', 'DRAFT')));
  check('a submitted indent can be approved',
    Boolean(findTransition('approve', 'PENDING_APPROVAL')));
  check('a submitted indent can be rejected',
    Boolean(findTransition('reject', 'PENDING_APPROVAL')));
  check('an approved indent cannot be approved again',
    !findTransition('approve', 'APPROVED'));
  check('a rejected indent cannot then be approved',
    !findTransition('approve', 'REJECTED'));
  check('a draft cannot be approved before it is submitted',
    !findTransition('approve', 'DRAFT'));

  // -------------------------------------------------------------------------
  console.log('\nPassword gate');
  // -------------------------------------------------------------------------
  /*
   * `checkActionPassword` is the whole gate, and it is the same function the
   * server action calls before it will move an indent — so testing it here
   * tests the real guard rather than a copy of it.
   */
  check('approve requires the password',
    findTransition('approve', 'PENDING_APPROVAL')!.requiresPassword);
  check('reject requires the password',
    findTransition('reject', 'PENDING_APPROVAL')!.requiresPassword);
  check('submit does not require the password',
    !findTransition('submit', 'DRAFT')!.requiresPassword);
  check('reject demands a reason',
    findTransition('reject', 'PENDING_APPROVAL')!.requiresNote);

  /*
   * A password invented here, not the real one.
   *
   * The gate reads ACTION_PASSWORD at call time, so the test can set its own
   * and never needs the deployed value written down in a file that gets
   * published. It also makes this suite hermetic: it no longer depends on
   * whatever happens to be in the developer's .env.
   */
  const TEST_PASSWORD = 'verify-only-not-a-real-password';
  process.env.ACTION_PASSWORD = TEST_PASSWORD;

  check('the correct password is accepted', checkActionPassword(TEST_PASSWORD));
  check('a wrong password is refused', !checkActionPassword('wrong'));
  check('an empty password is refused', !checkActionPassword(''));
  check('case matters', !checkActionPassword(TEST_PASSWORD.toUpperCase()));
  check('a prefix of the password is refused',
    !checkActionPassword(TEST_PASSWORD.slice(0, -1)));
  check('trailing whitespace is refused', !checkActionPassword(`${TEST_PASSWORD} `));

  delete process.env.ACTION_PASSWORD;
  let refusedWithoutConfig = false;
  try {
    checkActionPassword(TEST_PASSWORD);
  } catch {
    refusedWithoutConfig = true;
  }
  check('an unset password refuses loudly rather than falling back',
    refusedWithoutConfig);
  process.env.ACTION_PASSWORD = TEST_PASSWORD;

  /*
   * The password module holds a literal fallback, so a client import would ship
   * it to every browser. Enforced here rather than by `server-only`, which
   * would have made the gate above untestable.
   */
  const clientFiles: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const src = readFileSync(full, 'utf8');
        if (/^\s*['"]use client['"]/m.test(src)) clientFiles.push(full);
      }
    }
  })(join(process.cwd(), 'src'));

  const leaks = clientFiles.filter((f) =>
    /from\s+['"].*action-password['"]/.test(readFileSync(f, 'utf8')),
  );

  check(
    `no client component imports the password (${clientFiles.length} client files scanned)`,
    leaks.length === 0,
    leaks.join(', '),
  );

  // -------------------------------------------------------------------------
  console.log('\nDialog closing');
  // -------------------------------------------------------------------------
  /*
   * Regression guard.
   *
   * The approve dialog once vanished the instant it opened, because the code
   * treated "no errors yet" as "the action succeeded" — and useActionState's
   * initial state has no errors. No amount of page-render testing catches that;
   * it only shows up when a human clicks the button.
   */
  check('an untouched form stays open', !shouldCloseAfter({}));
  check('an undefined state stays open', !shouldCloseAfter(undefined));
  check('a wrong password keeps the dialog open',
    !shouldCloseAfter({ fieldErrors: { password: 'That password is not correct.' } }));
  check('a missing reason keeps the dialog open',
    !shouldCloseAfter({ fieldErrors: { note: 'Say why.' } }));
  check('a general error keeps the dialog open',
    !shouldCloseAfter({ error: 'That indent no longer exists.' }));
  check('only an explicit success closes it', shouldCloseAfter({ ok: true }));

  // -------------------------------------------------------------------------
  console.log('\nShow-password toggle');
  // -------------------------------------------------------------------------
  /*
   * These read the component source rather than drive a browser, so they prove
   * structure, not behaviour — see the note in the README about what is and is
   * not covered here. They are worth having anyway: each one guards a mistake
   * that is easy to reintroduce and silent when made.
   */
  const decideSrc = readFileSync(
    join(process.cwd(), 'src/components/decide-buttons.tsx'),
    'utf8',
  );

  check('the password field offers a reveal toggle',
    /aria-label=\{shown \? 'Hide password' : 'Show password'\}/.test(decideSrc));

  /*
   * A bare <button> inside a <form> defaults to type="submit". Without this,
   * pressing the eye would submit the half-typed password instead of showing
   * it — and the server would answer "wrong password".
   */
  check('the toggle never submits the form',
    /onClick=\{\(\) => setShown/.test(decideSrc) &&
    /type="button"\s*\n\s*onClick=\{\(\) => setShown/.test(decideSrc));

  check('it starts hidden', /const \[shown, setShown\] = useState\(false\)/.test(decideSrc));

  check('the input type follows the toggle',
    /type=\{shown \? 'text' : 'password'\}/.test(decideSrc));

  // Screen readers need the state, which an icon swap alone does not convey.
  check('the toggle reports its state', /aria-pressed=\{shown\}/.test(decideSrc));

  // A remount would wipe what was typed — including after a wrong password.
  check('revealing does not remount the input',
    !/key=\{shown/.test(decideSrc));

  // -------------------------------------------------------------------------
  console.log('\nTyped unit of measure');
  // -------------------------------------------------------------------------
  const line = (uomCode: string) =>
    indentLineSchema.safeParse({
      customDescription: 'V-belt B-52',
      uomCode,
      requiredQty: '4',
    });

  check('a unit is accepted as typed', line('NOS').success);
  check('lower case is folded up, so "kg" cannot become a second row',
    line('kg').success && line('kg').data?.uomCode === 'KG');
  check('surrounding spaces are trimmed', line('  MTR  ').data?.uomCode === 'MTR');
  check('a unit with a slash is allowed (RM/KG)', line('RM/KG').success);
  // Optional, by decision: most rows here are counted in Nos, and stopping
  // someone over a box whose answer is nearly always the same is friction.
  check('a blank unit falls back to NOS', line('').data?.uomCode === 'NOS');
  check('a spaces-only unit falls back to NOS', line('   ').data?.uomCode === 'NOS');
  check('a unit with punctuation is refused', !line('KG;DROP').success);
  check('an over-long unit is refused', !line('KILOGRAMSPERMETRE').success);

  // -------------------------------------------------------------------------
  console.log('\nWhat is still mandatory');
  // -------------------------------------------------------------------------
  /*
   * Four things, and no more: the department, who asked, and per row what the
   * item is and how much of it. Everything else was made optional deliberately.
   */
  const indent = (over: Record<string, unknown> = {}) =>
    indentSchema.safeParse({
      indentDate: '2026-07-30',
      departmentName: 'Maintenance',
      requesterName: 'Ramesh Kumar',
      requesterDesignation: 'Shift Technician',
      priority: 'LEVEL_3',
      lines: [{ customDescription: 'V-belt B-52', uomCode: 'NOS', requiredQty: '4' }],
      ...over,
    });

  check('a complete indent is accepted', indent().success);

  check('a department is still required', !indent({ departmentName: '' }).success);
  check('a one-letter department is refused', !indent({ departmentName: 'X' }).success);
  check('a department is accepted as typed',
    indent({ departmentName: 'Utilities & Boiler' }).data?.departmentName ===
      'Utilities & Boiler');
  check('surrounding spaces are trimmed off it',
    indent({ departmentName: '  Stores  ' }).data?.departmentName === 'Stores');
  check('a requester name is still required', !indent({ requesterName: '' }).success);
  check('at least one item is still required', !indent({ lines: [] }).success);
  check('an item still needs a quantity',
    !indent({ lines: [{ customDescription: 'x', uomCode: 'NOS', requiredQty: '' }] })
      .success);
  check('an item still needs a description or a catalog pick',
    !indent({ lines: [{ uomCode: 'NOS', requiredQty: '2' }] }).success);

  check('a designation is optional', indent({ requesterDesignation: '' }).success);
  check('so is the expected date', indent({ expectedDate: '' }).success);
  check('so are the remarks', indent({ purpose: '' }).success);
  check('a row with no unit is accepted and reads NOS',
    indent({ lines: [{ customDescription: 'x', uomCode: '', requiredQty: '2' }] })
      .data?.lines[0].uomCode === 'NOS');
  check('a cleared date becomes today rather than an error',
    /^\d{4}-\d{2}-\d{2}$/.test(indent({ indentDate: '' }).data?.indentDate ?? ''));
  check('a nonsense date is still refused', !indent({ indentDate: '30-07-2026' }).success);

  // -------------------------------------------------------------------------
  console.log('\nThe form as the browser actually posts it');
  // -------------------------------------------------------------------------
  /*
   * Regression guard for a bug that reached the user.
   *
   * Every check above builds a plain object by hand and hands it to the schema,
   * so all of them passed while the real form was refusing to submit. What the
   * browser sends is a FormData, and `formData.get()` answers null — not
   * undefined — for a box that is no longer on the page. Zod's `.optional()`
   * takes undefined and rejects null, so the removed department-reference field
   * came back as "deptRef is required" on a form with no such field.
   *
   * These build the FormData exactly as the form renders it.
   */
  function browserForm(over: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const fields: Record<string, string> = {
      indentDate: '2026-07-30',
      departmentName: 'Maintenance',
      requesterName: 'Ramesh Kumar',
      requesterDesignation: 'Shift Technician',
      priority: 'LEVEL_2',
      expectedDate: '',
      purpose: '',
      ...over,
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  // The action JSON.parses the hidden "lines" field before mapping, so this is
  // the array shape the mapper actually receives.
  const oneLine = JSON.parse(
    JSON.stringify([{ customDescription: 'V-belt B-52', uomCode: 'NOS', requiredQty: '4' }]),
  );

  const posted = indentSchema.safeParse(indentInputFromForm(browserForm(), oneLine));
  check('a filled-in form submits', posted.success,
    posted.success ? '' : JSON.stringify(posted.error.issues));

  check('and asks for nothing that is not on the form',
    posted.success ||
      !posted.error.issues.some((i) => i.path.join('.') === 'deptRef'));

  // The specific shape of the bug: a field the form does not render at all.
  const fd = browserForm();
  check('a field absent from the form is absent from the payload',
    fd.get('deptRef') === null);

  const withoutOptionals = browserForm();
  withoutOptionals.delete('expectedDate');
  withoutOptionals.delete('purpose');
  withoutOptionals.delete('requesterDesignation');
  withoutOptionals.delete('indentDate');
  const sparse = indentSchema.safeParse(
    indentInputFromForm(withoutOptionals, oneLine),
  );
  check('optional boxes may be missing entirely, not merely empty', sparse.success,
    sparse.success ? '' : JSON.stringify(sparse.error.issues));
  check('a missing date still becomes today',
    /^\d{4}-\d{2}-\d{2}$/.test(sparse.success ? sparse.data.indentDate : ''));

  const noDept = indentSchema.safeParse(
    indentInputFromForm(browserForm({ departmentName: '' }), oneLine),
  );
  check('a genuinely required field is still refused', !noDept.success);
  check('and it is named as the department, not as something else',
    !noDept.success &&
      noDept.error.issues.some((i) => i.path.join('.') === 'departmentName'));

  // -------------------------------------------------------------------------
  console.log('\nWhat is still missing');
  // -------------------------------------------------------------------------
  /*
   * The summary at the top of the form. It names places, not rules — the rule
   * itself is already printed in red beside the field.
   */
  check('a top-level field is named the way the form names it',
    labelForPath('departmentName') === 'Department');
  check('an item row is named by its position',
    labelForPath('lines.1.requiredQty') === 'Item 2 — Required qty');
  check('the unit reads as "Unit"', labelForPath('lines.0.uomCode') === 'Item 1 — Unit');
  check('an array-level error falls back to the section',
    labelForPath('lines') === 'Items');
  check('an unknown path degrades to itself rather than crashing',
    labelForPath('somethingNew') === 'somethingNew');

  const missing = describeMissing({
    departmentName: 'Enter a department',
    requesterName: 'Enter the requester’s name',
    'lines.0.requiredQty': 'Enter a quantity',
    'lines.2.uomCode': 'Enter a unit',
  });
  check('every failing field is listed', missing.length === 4);
  check('in the order the form lays them out',
    missing[0] === 'Department' && missing[3] === 'Item 3 — Unit');
  check('nothing to report when there are no errors',
    describeMissing(undefined).length === 0 && describeMissing({}).length === 0);
  // Defensive: Zod will not emit two paths for one field, but the summary must
  // not start repeating itself if it ever does.
  check('the same place is not listed twice',
    describeMissing({ 'lines.0.uomCode': 'a', 'lines.00.uomCode': 'b' }).length === 1);

  // -------------------------------------------------------------------------
  console.log('\nReturn path (open-redirect guard)');
  // -------------------------------------------------------------------------
  /*
   * returnTo arrives from the browser and is used in a redirect, so it is the
   * one field here that could send someone to another site if it were trusted.
   */
  const okPath = (p: string) =>
    transitionSchema.safeParse({
      indentId: '00000000-0000-4000-8000-000000000000',
      action: 'approve',
      returnTo: p,
    }).success;

  check('a normal path is allowed', okPath('/indents'));
  check('a nested path is allowed', okPath('/indents/abc-123'));
  check('a protocol-relative URL is refused', !okPath('//evil.example.com'));
  check('a backslash trick is refused', !okPath('/\\evil.example.com'));
  check('an absolute URL is refused', !okPath('https://evil.example.com'));
  check('a path not starting with / is refused', !okPath('evil.example.com'));
  check('a path with a query is refused', !okPath('/indents?x=1'));

  // -------------------------------------------------------------------------
  console.log('\nCascades');
  // -------------------------------------------------------------------------
  await db.exec(`delete from indents where id='77777777-7777-7777-7777-777777777777'`);
  const orphanLines = await db.query(`select 1 from indent_lines`);
  const orphanEvents = await db.query(`select 1 from indent_events`);
  check('deleting a draft removes its lines', orphanLines.rows.length === 0);
  check('deleting a draft removes its events', orphanEvents.rows.length === 0);

  // -------------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nVerification crashed:', err);
  process.exit(1);
});
