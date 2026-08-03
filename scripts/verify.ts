import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import {
  allowedActions,
  findTransition,
  requiredPermission,
  TRANSITIONS,
} from '../src/lib/workflow';
import { can, permissionsFor, type Principal } from '../src/lib/rbac';
import { hashPassword, normaliseEmail, verifyPassword } from '../src/lib/password';
import { shouldCloseAfter } from '../src/lib/action-state';
import {
  changePasswordSchema,
  formFlag,
  formValue,
  formValues,
  indentInputFromForm,
  indentLineSchema,
  indentSchema,
  loginSchema,
  personSchema,
  transitionSchema,
} from '../src/lib/validation';
import { describeMissing, labelForPath } from '../src/lib/form-summary';
import { hashLines } from '../src/lib/indent-no';

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

  /*
   * The exact set, by name, rather than a count.
   *
   * A count told you a table was missing but not which, said nothing about one
   * arriving under the wrong name, and had to be edited on every migration that
   * added anything — so it drifted into being a number somebody bumped rather
   * than a claim anybody checked. Naming them means a new table is a deliberate
   * line in this list.
   */
  const EXPECTED_TABLES = [
    'activity_log',
    'counters',
    'departments',
    'indent_events',
    'indent_lines',
    'indents',
    'item_categories',
    'items',
    'notifications',
    'people',
    'sessions',
    'uoms',
  ];

  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema='public' order by table_name`,
  );
  const actualTables = tables.rows.map((r) => r.table_name);

  check(
    `every table the migrations describe exists (${EXPECTED_TABLES.length})`,
    actualTables.join(',') === EXPECTED_TABLES.join(','),
    `got ${actualTables.length}: ${actualTables.join(', ')}`,
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
  /*
   * The real hashLines, not a copy of it.
   *
   * There used to be a reimplementation here, and it had drifted: it left out
   * balanceQty entirely. So these checks were exercising an algorithm that no
   * longer matched the one guarding real indents — production could have
   * broken and this would still have passed. Rows come back snake_cased, so
   * the only thing left to do locally is rename the keys.
   */
  type LineRow = {
    line_no: number;
    item_id: string | null;
    custom_description: string | null;
    uom_id: string;
    balance_qty: string | null;
    required_qty: string;
  };

  const hashRows = (rows: LineRow[]) =>
    hashLines(
      rows.map((r) => ({
        lineNo: r.line_no,
        itemId: r.item_id,
        customDescription: r.custom_description,
        uomId: r.uom_id,
        balanceQty: r.balance_qty,
        requiredQty: r.required_qty,
      })),
    );

  const linesQ = await db.query<LineRow>(
    `select line_no, item_id, custom_description, uom_id, balance_qty, required_qty
     from indent_lines where indent_id='77777777-7777-7777-7777-777777777777'
     order by line_no`,
  );
  const signedHash = hashRows(linesQ.rows);

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
  const afterQ = await db.query<LineRow>(
    `select line_no, item_id, custom_description, uom_id, balance_qty, required_qty
     from indent_lines where indent_id='77777777-7777-7777-7777-777777777777' order by line_no`,
  );
  const afterHash = hashRows(afterQ.rows);
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
  console.log('\nConfirmation, and what replaced the shared password');
  // -------------------------------------------------------------------------
  /*
   * Approve used to be gated by a password every approver shared. That was the
   * whole authorisation control back when there was no sign-in — without it any
   * visitor could have approved a purchase.
   *
   * Accounts replaced it. rbac decides who may approve (see "Who may decide"
   * above), and asking that person for a second secret everybody already knows
   * protected nothing. What survives on Approve is a confirmation: a guard
   * against the wrong button, not against the wrong person.
   */
  check('approve asks for confirmation',
    findTransition('approve', 'PENDING_APPROVAL')!.confirm);
  check('reject does not — one click',
    !findTransition('reject', 'PENDING_APPROVAL')!.confirm);
  check('nor does submitting a draft',
    !findTransition('submit', 'DRAFT')!.confirm);

  check('no transition mentions a password any more',
    TRANSITIONS.every((t) => !('requiresPassword' in t)));
  check('and none asks for a written note',
    TRANSITIONS.every((t) => !('requiresNote' in t)));

  /*
   * The transition payload no longer carries a password at all, so approving
   * must succeed without one and must not keep a stray field around.
   */
  const noPassword = transitionSchema.safeParse({
    indentId: '11111111-1111-4111-8111-111111111111',
    action: 'approve',
    returnTo: '/indents',
  });
  check('an approve payload needs no password field', noPassword.success);
  check('and the parsed result carries none',
    noPassword.success && !('password' in noPassword.data));

  /*
   * password.ts is deliberately NOT marked `server-only` — the seed script has
   * to import it, and a second copy in scripts/ is exactly the drift that once
   * left the tamper checks running an algorithm no real indent was guarded by.
   *
   * That exemption costs something: nothing stops a client component importing
   * it and pulling node:crypto, or a session lookup, into the browser bundle.
   * This scan is what replaces the compiler's guard.
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
    /from\s+['"][^'"]*lib\/(password|auth|guard)['"]/.test(readFileSync(f, 'utf8')),
  );

  check(
    `no client component imports password, auth or guard (${clientFiles.length} scanned)`,
    leaks.length === 0,
    leaks.join(', '),
  );

  // -------------------------------------------------------------------------
  console.log('\nThe tamper digest survived the column being dropped');
  // -------------------------------------------------------------------------
  /*
   * indent_lines.specification was removed. It was part of the canonical string
   * hashLines builds, so dropping it from that string would change the digest
   * of every indent already signed off — and each of them would start reporting
   * that its items had been altered after sign-off.
   *
   * Every row held null, contributing an empty field, so an empty field was
   * left in its place. This locks that decision: the literal below was computed
   * from the algorithm as it stood BEFORE the column was removed. If someone
   * later tidies the gap away, this fails rather than a real indent quietly
   * accusing itself of tampering.
   *
   * Worth knowing when reading the canonical form: fields are joined with the
   * ASCII unit separator and rows with the record separator, both invisible in
   * an editor. That is also why an empty field is safe to leave — it still
   * occupies its position, so nothing either side of it shifts.
   */
  const DIGEST_BEFORE_THE_COLUMN_WAS_DROPPED =
    'f45c6e2c8d3483f42ebc7f09e88bd3d26e8d362115f3e0c11aaf3b7271b61531';

  const signedLines = [
    {
      lineNo: 1,
      itemId: null,
      customDescription: 'V-belt B-52',
      uomId: '22222222-2222-2222-2222-222222222222',
      balanceQty: '2',
      requiredQty: '6',
    },
    {
      lineNo: 2,
      itemId: '66666666-6666-6666-6666-666666666666',
      customDescription: null,
      uomId: '22222222-2222-2222-2222-222222222222',
      balanceQty: null,
      requiredQty: '4',
    },
  ];

  check('an already-signed indent still hashes to the same value',
    hashLines(signedLines) === DIGEST_BEFORE_THE_COLUMN_WAS_DROPPED,
    hashLines(signedLines));

  // -------------------------------------------------------------------------
  console.log('\nWho may decide');
  // -------------------------------------------------------------------------
  /*
   * Who may decide, now that there is a sign-in.
   *
   * These used to come with a caveat: they proved the rules filtered correctly
   * but not that the rules could not be walked around, because the acting-as
   * name was the user's own choice. That caveat is gone. The person is whoever
   * holds the session, and a session cannot be picked from a dropdown.
   */
  const superAdmin: Principal = { role: 'SUPER_ADMIN', canApprove: false, canReject: false };
  const hod: Principal = { role: 'HOD', canApprove: false, canReject: false };
  const purchase: Principal = { role: 'PURCHASE', canApprove: false, canReject: false };
  const deputy: Principal = { role: 'HOD', canApprove: true, canReject: true };

  check('approving needs the approve permission',
    requiredPermission('approve') === 'indent:approve');
  check('rejecting needs the reject permission',
    requiredPermission('reject') === 'indent:reject');
  check('submitting needs no decision permission', requiredPermission('submit') === null);

  // --- the policy itself ---------------------------------------------------
  check('a Super Admin may approve', can(superAdmin, 'indent:approve'));
  check('a Super Admin may reject', can(superAdmin, 'indent:reject'));
  check('a Super Admin may manage users', can(superAdmin, 'user:manage'));

  check('an HOD may NOT approve', !can(hod, 'indent:approve'));
  check('an HOD may NOT reject', !can(hod, 'indent:reject'));
  check('an HOD may NOT manage users', !can(hod, 'user:manage'));
  check('an HOD may NOT see other departments', !can(hod, 'indent:view:all'));
  check('an HOD may raise an indent', can(hod, 'indent:create'));

  check('Purchase may NOT approve', !can(purchase, 'indent:approve'));
  check('Purchase may see approved indents', can(purchase, 'indent:view:all'));
  check('Purchase may NOT manage users', !can(purchase, 'user:manage'));

  check('nobody signed out has any permission', permissionsFor(null).size === 0);

  /*
   * The per-person grants are additive only. Clearing a flag must not be able
   * to strip a Super Admin of something their role confers — otherwise
   * unticking a box on the Users screen would quietly disarm the only person
   * who can approve anything.
   */
  check('an extra grant can deputise an HOD to approve', can(deputy, 'indent:approve'));
  check('but does not make them an administrator', !can(deputy, 'user:manage'));
  check('and a cleared flag cannot disarm a Super Admin',
    can({ role: 'SUPER_ADMIN', canApprove: false, canReject: false }, 'indent:approve'));

  // --- what that means for the buttons -------------------------------------
  const names = (s: 'PENDING_APPROVAL' | 'DRAFT', p: Principal | null) =>
    allowedActions(s, p).map((a) => a.action).sort().join(',');

  check('a Super Admin sees both decisions',
    names('PENDING_APPROVAL', superAdmin) === 'approve,reject');
  check('an HOD sees no decision at all', names('PENDING_APPROVAL', hod) === '');
  check('Purchase sees no decision either', names('PENDING_APPROVAL', purchase) === '');
  check('a deputy sees both', names('PENDING_APPROVAL', deputy) === 'approve,reject');
  check('and nobody signed out sees any', names('PENDING_APPROVAL', null) === '');

  check('an HOD may still submit their own draft', names('DRAFT', hod) === 'submit');

  check('permissions cannot conjure an action the state forbids',
    names('DRAFT', superAdmin) === 'submit');

  // -------------------------------------------------------------------------
  console.log('\nAbsent optional fields (the null-vs-undefined trap)');
  // -------------------------------------------------------------------------
  /*
   * The bug that has now bitten three times.
   *
   * `formData.get()` answers null for a field the form did not render, and
   * Zod's .optional() accepts undefined but rejects null. So an optional field
   * that is simply absent from the markup is reported as *invalid* — against a
   * control that is not on the screen, which means the form has nowhere to show
   * the error and the page appears to do nothing at all.
   *
   *   deptRef   a removed field kept being demanded, and named itself
   *   returnTo  sign-in silently did nothing
   *   password  Reject silently did nothing, for the same reason
   *
   * Every schema that reads a form is checked here against a payload built the
   * way the action builds it, with the optional fields genuinely missing.
   */
  const emptyForm = new FormData();

  check('formValue turns an absent field into undefined',
    formValue(emptyForm, 'nothing') === undefined);
  check('formFlag reads an unticked checkbox as false',
    formFlag(emptyForm, 'nothing') === false);

  // --- sign-in, with no returnTo box on the page ---------------------------
  const loginForm = new FormData();
  loginForm.set('email', 'saurabh@artizia.co.in');
  loginForm.set('password', 'whatever-they-typed');

  const loginParsed = loginSchema.safeParse(
    formValues(loginForm, ['email', 'password', 'returnTo']),
  );
  check('sign-in accepts a form with no returnTo field', loginParsed.success,
    loginParsed.success ? '' : JSON.stringify(loginParsed.error.issues));

  // Proof the trap is real, so this test cannot be neutered by accident.
  const loginRaw = loginSchema.safeParse({
    email: 'saurabh@artizia.co.in',
    password: 'whatever-they-typed',
    returnTo: loginForm.get('returnTo'),
  });
  check('and reading it raw would have refused it — the trap is real',
    !loginRaw.success);

  // --- Reject, whose form has no password box ------------------------------
  const rejectForm = new FormData();
  rejectForm.set('indentId', '11111111-1111-4111-8111-111111111111');
  rejectForm.set('action', 'reject');
  rejectForm.set('returnTo', '/indents');

  const rejectParsed = transitionSchema.safeParse(
    formValues(rejectForm, ['indentId', 'action', 'password', 'returnTo']),
  );
  check('Reject accepts a form with no password field', rejectParsed.success,
    rejectParsed.success ? '' : JSON.stringify(rejectParsed.error.issues));

  // --- a forced password change, with no current-password box --------------
  const pwForm = new FormData();
  pwForm.set('password', 'a-long-enough-password');
  pwForm.set('confirmPassword', 'a-long-enough-password');

  const pwParsed = changePasswordSchema.safeParse(
    formValues(pwForm, ['currentPassword', 'password', 'confirmPassword']),
  );
  check('a forced password change accepts no current password', pwParsed.success,
    pwParsed.success ? '' : JSON.stringify(pwParsed.error.issues));

  // --- creating a user with only the required boxes filled -----------------
  const userForm = new FormData();
  userForm.set('name', 'Ramesh Kumar');
  userForm.set('designation', 'Head — Maintenance');
  userForm.set('email', 'ramesh@artizia.co.in');
  userForm.set('role', 'HOD');

  const userParsed = personSchema.safeParse({
    ...formValues(userForm, [
      'name', 'designation', 'email', 'phone', 'role', 'departmentId', 'password',
    ]),
    canApprove: formFlag(userForm, 'canApprove'),
    canReject: formFlag(userForm, 'canReject'),
  });
  check('a user can be created with no phone, department or password',
    userParsed.success,
    userParsed.success ? '' : JSON.stringify(userParsed.error.issues));

  // -------------------------------------------------------------------------
  console.log('\nPasswords');
  // -------------------------------------------------------------------------
  /*
   * The real implementation, imported — not a copy.
   *
   * This file once carried its own version of hashLines that had drifted from
   * the production one, so the tamper checks were exercising an algorithm no
   * indent was actually guarded by. Password hashing lives in password.ts
   * rather than auth.ts precisely so this can import it: auth.ts is
   * `server-only` and unimportable here.
   */
  const stored = await hashPassword('correct horse battery staple');

  check('a correct password verifies', await verifyPassword('correct horse battery staple', stored));
  check('a wrong password does not', !(await verifyPassword('Correct Horse Battery Staple', stored)));
  check('an empty password does not', !(await verifyPassword('', stored)));
  check('a null hash refuses rather than throwing', !(await verifyPassword('anything', null)));
  check('a malformed hash refuses', !(await verifyPassword('anything', 'not-a-hash')));
  check('a truncated hash refuses', !(await verifyPassword('anything', 'scrypt$aa$bb')));

  check('the stored form is salted scrypt', /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(stored));

  /*
   * The same password must not produce the same row twice. If it did, a stolen
   * table would show at a glance which accounts share a password.
   */
  const again = await hashPassword('correct horse battery staple');
  check('the same password hashes differently each time', again !== stored);
  check('and the second one still verifies',
    await verifyPassword('correct horse battery staple', again));

  check('an email is lower-cased for storage',
    normaliseEmail('  Saurabh@Artizia.co.in ') === 'saurabh@artizia.co.in');

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
  check('any field error at all keeps it open',
    !shouldCloseAfter({ fieldErrors: { somethingNew: 'Not right.' } }));
  check('a general error keeps the dialog open',
    !shouldCloseAfter({ error: 'That indent no longer exists.' }));
  check('only an explicit success closes it', shouldCloseAfter({ ok: true }));

  // -------------------------------------------------------------------------
  console.log('\nShow-password toggle');
  // -------------------------------------------------------------------------
  /*
   * These read the component source rather than drive a browser, so they prove
   * structure, not behaviour. They are worth having anyway: each guards a
   * mistake that is easy to reintroduce and silent when made.
   *
   * They used to point at decide-buttons.tsx, where Approve asked for a shared
   * password. That password is gone — accounts replaced it — so the only
   * password fields left are the real ones: sign-in, changing your own, and an
   * admin resetting somebody else's. All three render `PasswordField` from
   * login-form.tsx, which is why one file is the right thing to check.
   */
  const pwSrc = readFileSync(
    join(process.cwd(), 'src/components/login-form.tsx'),
    'utf8',
  );

  check('the password field offers a reveal toggle',
    /aria-label=\{revealed \? 'Hide password' : 'Show password'\}/.test(pwSrc));

  /*
   * A bare <button> inside a <form> defaults to type="submit". Without this,
   * pressing the eye would submit a half-typed password instead of showing it,
   * and the server would answer "wrong email or password".
   */
  check('the toggle never submits the form',
    /type="button"\s*\n\s*onClick=\{\(\) => setRevealed/.test(pwSrc));

  check('it starts hidden',
    /const \[revealed, setRevealed\] = useState\(false\)/.test(pwSrc));

  check('the input type follows the toggle',
    /type=\{revealed \? 'text' : 'password'\}/.test(pwSrc));

  // Screen readers need the state, which an icon swap alone does not convey.
  check('the toggle reports its state', /aria-pressed=\{revealed\}/.test(pwSrc));

  /*
   * autoComplete is not cosmetic. Without it a browser files the new-password
   * box under the admin's own saved credentials and offers the wrong one back.
   */
  check('sign-in asks for the saved password, not a new one',
    /autoComplete="current-password"/.test(pwSrc));

  // A remount would wipe what was typed — including after a wrong password,
  // where the box must keep the attempt so it can be corrected.
  check('revealing does not remount the input',
    !/key=\{revealed/.test(pwSrc));

  // -------------------------------------------------------------------------
  console.log('\nThe form keeps what was typed');
  // -------------------------------------------------------------------------
  /*
   * React resets an uncontrolled form once its action completes — including
   * when the action came back with field errors. So submitting with one box
   * empty wiped every other box on the way to reporting which one was wrong,
   * and the whole header had to be typed again. It reached a user before it was
   * noticed, because the item rows survived — the editor holds those in its own
   * state — and losing only half a form reads as a glitch rather than a bug.
   *
   * The fix is that the header fields are controlled. Re-pointing defaultValue
   * would not have worked: React does not push a changed defaultValue into an
   * input that is already mounted.
   *
   * These read source rather than drive a browser, so they prove structure, not
   * behaviour. Worth having anyway: it is a one-word regression to reintroduce
   * and silent when made.
   */
  const formSrc = readFileSync(
    join(process.cwd(), 'src/components/indent-form.tsx'),
    'utf8',
  );

  check('the header fields are held in state',
    /const \[fields, setFields\] = useState\(/.test(formSrc));
  check('and none of them fall back to an uncontrolled defaultValue',
    !/defaultValue=\{initial\?\./.test(formSrc));
  check('every one of them is bound through the helper',
    (formSrc.match(/\{\.\.\.bind\('/g) ?? []).length === 7);

  /*
   * `required` on the two fields the schema refuses anyway, so the browser
   * blocks the submission before it is posted and the round-trip that used to
   * lose the typing never happens for the common mistake.
   */
  check('the department is refused by the browser before posting',
    /name="departmentName"[\s\S]{0,240}required/.test(formSrc));
  check('so is the requester name',
    /name="requesterName"[\s\S]{0,240}required/.test(formSrc));

  /*
   * The unit column carries no datalist. Chrome draws a dropdown arrow inside
   * any input with `list`, and on a three-letter column that arrow was the
   * widest thing in it.
   */
  const editorSrc = readFileSync(
    join(process.cwd(), 'src/components/line-editor.tsx'),
    'utf8',
  );
  check('the unit field has no picker attached', !/uomListId/.test(editorSrc));
  check('but the item name still offers the catalog',
    /list=\{itemListId\}/.test(editorSrc));
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
