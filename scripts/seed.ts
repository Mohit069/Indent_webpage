import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { departments, itemCategories, items, people, uoms } from '../src/db/schema';

/*
 * Seed.
 *
 * Creates the masters this cannot start without. Safe to run more than once:
 * every insert is ON CONFLICT DO NOTHING, so re-running after adding a
 * department by hand will not wipe or duplicate it.
 *
 * There are no accounts to create — nothing signs in. The `people` rows are
 * only the names offered in the "acting as" picker, so the printed indent's
 * signature boxes carry a name. Edit them from Settings → People.
 */

const UOMS = [
  { code: 'NOS', name: 'Numbers' },
  { code: 'KG', name: 'Kilogram' },
  { code: 'LTR', name: 'Litre' },
  { code: 'MTR', name: 'Metre' },
  { code: 'SQM', name: 'Square Metre' },
  { code: 'SET', name: 'Set' },
  { code: 'BOX', name: 'Box' },
  { code: 'ROLL', name: 'Roll' },
  { code: 'PKT', name: 'Packet' },
  { code: 'TON', name: 'Tonne' },
];

const DEPARTMENTS = [
  { name: 'Production', code: 'PROD' },
  { name: 'Maintenance', code: 'MAINT' },
  { name: 'Quality Control', code: 'QC' },
  { name: 'Stores', code: 'STORE' },
  { name: 'Dispatch & Logistics', code: 'DISP' },
  { name: 'Administration', code: 'ADMIN' },
  { name: 'Safety', code: 'SAFE' },
];

const CATEGORIES = [
  'Bearings & Power Transmission',
  'Electrical & Instrumentation',
  'Hydraulics & Pneumatics',
  'Abrasives & Polishing',
  'Chemicals & Resins',
  'Safety & PPE',
  'Tools & Consumables',
  'Packing & Dispatch',
  'Office & Stationery',
];

/** Placeholders — replace these with the real two or three from Settings. */
const PEOPLE = [
  { name: 'Plant Head', designation: 'Head of Plant' },
  { name: 'Purchase Officer', designation: 'Purchase Dept.' },
  { name: 'Approving Authority', designation: 'Director' },
];

async function main() {
  console.log('Seeding…\n');

  await db.insert(uoms).values(UOMS).onConflictDoNothing();
  console.log(`  units of measure   ${UOMS.length}`);

  await db.insert(departments).values(DEPARTMENTS).onConflictDoNothing();
  console.log(`  departments        ${DEPARTMENTS.length}`);

  await db
    .insert(itemCategories)
    .values(CATEGORIES.map((name) => ({ name })))
    .onConflictDoNothing();
  console.log(`  item categories    ${CATEGORIES.length}`);

  // Only seed people into an empty table, so real names added later survive.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(people);

  if (count === 0) {
    await db.insert(people).values(PEOPLE);
    console.log(`  people             ${PEOPLE.length}  (placeholders — rename in Settings)`);
  } else {
    console.log(`  people             ${count} already present, left untouched`);
  }

  const [nos] = await db.select().from(uoms).where(sql`${uoms.code} = 'NOS'`).limit(1);
  const [ltr] = await db.select().from(uoms).where(sql`${uoms.code} = 'LTR'`).limit(1);

  if (nos && ltr) {
    await db
      .insert(items)
      .values([
        {
          code: 'BRG-6205',
          name: 'Deep groove ball bearing',
          specification: '6205 2RS · 25×52×15 mm',
          defaultUomId: nos.id,
        },
        {
          code: 'GLV-CUT5',
          name: 'Cut-resistant gloves',
          specification: 'Level 5 · size L',
          defaultUomId: nos.id,
        },
        {
          code: 'RSN-POLY',
          name: 'Polyester resin',
          specification: 'Unsaturated, general purpose',
          defaultUomId: ltr.id,
        },
      ])
      .onConflictDoNothing();
    console.log('  starter items      3');
  }

  console.log('\nDone. Open the app — there is nothing to sign into.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
