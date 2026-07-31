import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db';
import { departments, people } from '../src/db/schema';
// From password.ts, not auth.ts: the latter is `server-only` and unimportable
// here. Same implementation either way — that is the point of the split.
import { hashPassword, normaliseEmail } from '../src/lib/password';

/*
 * The first Super Admin, and the departments the company actually has.
 *
 * Run once after migration 0005. Until it has run there is no account with
 * `indent:approve`, because 0005 withdraws the flags from the three placeholder
 * people and grants them to nobody — so this script is not optional.
 *
 * Safe to run again. It updates the existing row rather than inserting a second
 * one, and it does not touch a password that has already been set unless
 * ADMIN_PASSWORD is given explicitly.
 */

const ADMIN = {
  name: 'Saurabh',
  email: 'saurabh@artizia.co.in',
  designation: 'Director',
} as const;

/*
 * From the brief. Only the missing ones are inserted — the seven already in the
 * database have indents pointing at them and codes that appear on printed
 * forms, so they are left exactly as they are.
 */
const DEPARTMENTS: { name: string; code: string }[] = [
  { name: 'Purchase', code: 'PURCH' },
  { name: 'Electrical', code: 'ELEC' },
  { name: 'Mechanical', code: 'MECH' },
  { name: 'Sampling', code: 'SAMP' },
  { name: 'Laboratory', code: 'LAB' },
  { name: 'Accounts', code: 'ACCT' },
];

/** Readable, unambiguous, and long enough to be worth typing once. Avoids the
 *  characters that get misread when a password is written on paper. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function main() {
  // --- departments -------------------------------------------------------
  let added = 0;
  for (const dept of DEPARTMENTS) {
    const existing = await db
      .select({ id: departments.id })
      .from(departments)
      .where(sql`lower(${departments.name}) = lower(${dept.name})`)
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(departments).values(dept).onConflictDoNothing();
    added += 1;
  }
  console.log(`\n  Departments: ${added} added, ${DEPARTMENTS.length - added} already present.`);

  // --- the Super Admin ---------------------------------------------------
  const email = normaliseEmail(ADMIN.email);
  const [existing] = await db.select().from(people).where(eq(people.email, email)).limit(1);

  const supplied = process.env.ADMIN_PASSWORD;

  if (existing) {
    /*
     * Do not silently re-hash a password that is already in use. Someone
     * re-running this to add departments should not find themselves locked out
     * of an account they have been signing into all week.
     */
    const keepPassword = existing.passwordHash !== null && !supplied;
    const password = keepPassword ? null : supplied ?? generatePassword();

    await db
      .update(people)
      .set({
        name: ADMIN.name,
        designation: ADMIN.designation,
        role: 'SUPER_ADMIN',
        isActive: true,
        ...(password
          ? { passwordHash: await hashPassword(password), mustChangePassword: !supplied }
          : {}),
      })
      .where(eq(people.id, existing.id));

    console.log(`\n  Updated ${ADMIN.name} <${email}> — role SUPER_ADMIN.`);
    if (password) {
      console.log(`\n  Password: ${password}`);
      if (!supplied) console.log('  Must be changed at first sign-in.');
    } else {
      console.log('  Existing password left untouched.');
    }
  } else {
    const password = supplied ?? generatePassword();

    await db.insert(people).values({
      name: ADMIN.name,
      email,
      designation: ADMIN.designation,
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(password),
      // A password this script printed to a terminal has been seen by whoever
      // ran it and by anyone reading over their shoulder. One that was supplied
      // deliberately via the environment was already chosen by its owner.
      mustChangePassword: !supplied,
      isActive: true,
    });

    console.log(`\n  Created ${ADMIN.name} <${email}> — role SUPER_ADMIN.`);
    console.log(`\n  Password: ${password}`);
    if (!supplied) console.log('  Must be changed at first sign-in.');
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
