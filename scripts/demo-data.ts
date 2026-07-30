import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
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
 * Demo rows, so every state is visible while the UI is being looked at.
 *
 * Deletes only the check fixture and anything this script created before.
 * Real indents are left alone.
 */

const DEMO_NOS = ['MQ/IND/26-27/0954', 'MQ/IND/26-27/0955'];
const DRAFT_PURPOSE = 'Monthly consumables top-up for the stores.';

async function main() {
  const [maint] = await db
    .select()
    .from(departments)
    .where(eq(departments.name, 'Maintenance'))
    .limit(1);
  const [prod] = await db.select().from(departments).limit(1);
  const [nos] = await db.select().from(uoms).where(eq(uoms.code, 'NOS')).limit(1);
  const [bearing] = await db.select().from(items).where(eq(items.code, 'BRG-6205')).limit(1);
  const everyone = await db.select().from(people).orderBy(people.name);

  if (!nos || !everyone.length) {
    console.log('Seed data missing — run `npm run db:seed` first.');
    process.exit(1);
  }

  const dept = maint ?? prod;
  const actor = everyone[0];

  /*
   * Clear the check fixture and any previous run of this script.
   *
   * The draft is matched on purpose and status rather than on its number,
   * because a draft has no number yet — matching only on indentNo left a
   * duplicate draft behind on every re-run.
   */
  await db
    .delete(indents)
    .where(eq(indents.requesterName, 'ZZ-CHECK-FIXTURE (safe to delete)'));
  for (const no of DEMO_NOS) {
    await db.delete(indents).where(eq(indents.indentNo, no));
  }
  await db
    .delete(indents)
    .where(sql`${indents.status} = 'DRAFT' and ${indents.purpose} = ${DRAFT_PURPOSE}`);

  // --- awaiting approval -----------------------------------------------
  const [waiting] = await db
    .insert(indents)
    .values({
      indentDate: new Date().toISOString().slice(0, 10),
      raisedById: actor.id,
      requesterName: 'Ramesh Kumar',
      requesterDesignation: 'Shift Technician',
      departmentId: dept.id,
      purpose: 'Line 2 polishing head is seizing — needs replacing before the next shift.',
      priority: 'ASAP',
      status: 'PENDING_APPROVAL',
      indentNo: DEMO_NOS[0],
      fy: '26-27',
      submittedAt: new Date(),
    })
    .returning({ id: indents.id });

  await db.insert(indentLines).values([
    {
      indentId: waiting.id,
      lineNo: 1,
      itemId: bearing?.id ?? null,
      customDescription: bearing ? null : 'Deep groove ball bearing 6205 2RS',
      uomId: nos.id,
      balanceQty: '2',
      requiredQty: '6',
    },
    {
      indentId: waiting.id,
      lineNo: 2,
      itemId: null,
      customDescription: 'V-belt B-52 wrapped',
      uomId: nos.id,
      requiredQty: '4',
      remarks: 'Same size as the one on the spare head.',
    },
  ]);

  const waitingLines = await db
    .select()
    .from(indentLines)
    .where(eq(indentLines.indentId, waiting.id));

  await db.insert(indentEvents).values([
    {
      indentId: waiting.id,
      stage: 'CREATE',
      toStatus: 'DRAFT',
      actorId: actor.id,
      actorNameSnapshot: actor.name,
      actorDesignationSnapshot: actor.designation,
    },
    {
      indentId: waiting.id,
      stage: 'SUBMIT',
      fromStatus: 'DRAFT',
      toStatus: 'PENDING_APPROVAL',
      actorId: actor.id,
      actorNameSnapshot: actor.name,
      actorDesignationSnapshot: actor.designation,
      linesHash: hashLines(waitingLines),
    },
  ]);

  // --- a draft, so the Draft badge and Submit path are visible ----------
  const [draft] = await db
    .insert(indents)
    .values({
      indentDate: new Date().toISOString().slice(0, 10),
      raisedById: actor.id,
      requesterName: 'Suresh Sharma',
      requesterDesignation: 'Store Keeper',
      departmentId: dept.id,
      purpose: DRAFT_PURPOSE,
      priority: 'LEVEL_2',
      status: 'DRAFT',
    })
    .returning({ id: indents.id });

  await db.insert(indentLines).values({
    indentId: draft.id,
    lineNo: 1,
    itemId: null,
    customDescription: 'Cotton waste cloth, 1 kg bundles',
    uomId: nos.id,
    balanceQty: '5',
    requiredQty: '20',
  });

  await db.insert(indentEvents).values({
    indentId: draft.id,
    stage: 'CREATE',
    toStatus: 'DRAFT',
    actorId: actor.id,
    actorNameSnapshot: actor.name,
    actorDesignationSnapshot: actor.designation,
  });

  /*
   * Move the counter past anything written by hand here.
   *
   * Without this the next real Submit would re-issue 0954 and die on the unique
   * constraint — the counter is the only thing that knows a number is spent, and
   * inserting one directly bypasses it.
   */
  const highest = Number(DEMO_NOS[0].split('/').pop());
  await db.execute(
    sql`update counters set last_value = ${highest}
        where fy = '26-27' and prefix = ${process.env.INDENT_PREFIX ?? 'MQ/IND'}
          and last_value < ${highest}`,
  );

  const all = await db.select().from(indents);
  console.log(`\n  ${all.length} indents now present.`);
  for (const i of all) {
    console.log(`   ${(i.indentNo ?? 'draft').padEnd(20)} ${i.status}`);
  }
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
