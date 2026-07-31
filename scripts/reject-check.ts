import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db';
import { departments, indentEvents, indentLines, indents, people, sessions, uoms } from '../src/db/schema';

/*
 * Reject, end to end, through the real HTTP endpoint.
 *
 * Reject was never confirmed working, and it shares the bug that broke
 * sign-in: its form carries no password box, so `password` arrived as null,
 * Zod's .optional() refused it, and the action returned a field error for a
 * control that is not on that form — one click, nothing happens, no message.
 *
 * Raises its own indent and deletes it afterwards. It must never touch a real
 * one: a previous script destroyed a genuine indent by deleting a number it
 * had not created.
 */
const BASE = 'http://localhost:3000';
const MARKER = 'ZZ-REJECT-CHECK (safe to delete)';

async function main() {
  const [admin] = await db.select().from(people).where(eq(people.role, 'SUPER_ADMIN')).limit(1);
  const [dept] = await db.select().from(departments).limit(1);
  const [nos] = await db.select().from(uoms).where(eq(uoms.code, 'NOS')).limit(1);

  // Clean up anything a previous run left behind, matched on its own marker.
  await db.delete(indents).where(eq(indents.requesterName, MARKER));

  const [fixture] = await db.insert(indents).values({
    indentDate: new Date().toISOString().slice(0, 10),
    requesterName: MARKER,
    requesterDesignation: 'Fixture',
    departmentId: dept.id,
    status: 'PENDING_APPROVAL',
    priority: 'LEVEL_3',
    submittedAt: new Date(),
  }).returning({ id: indents.id });

  await db.insert(indentLines).values({
    indentId: fixture.id, lineNo: 1, customDescription: 'Fixture item',
    uomId: nos.id, requiredQty: '1',
  });

  const original = admin.mustChangePassword;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.insert(sessions).values({
    personId: admin.id, tokenHash, expiresAt: new Date(Date.now() + 600000),
  });
  await db.update(people).set({ mustChangePassword: false }).where(eq(people.id, admin.id));

  try {
    const cookie = `indent_session=${token}`;
    const url = `${BASE}/admin/indents/${fixture.id}`;
    const html = await (await fetch(url, { headers: { cookie } })).text();

    const id = html.match(/&quot;id&quot;:&quot;([a-f0-9]+)&quot;/)?.[1];
    const key = html.match(/name="\$ACTION_KEY" value="([^"]*)"/)?.[1];
    if (!id) { console.log('\n  FAIL  no action reference on the page\n'); return; }

    const form = new FormData();
    form.set('$ACTION_REF_1', '');
    form.set('$ACTION_1:0', JSON.stringify({ id, bound: '$@1' }));
    form.set('$ACTION_1:1', '[{}]');
    if (key) form.set('$ACTION_KEY', key);
    form.set('indentId', fixture.id);
    form.set('action', 'reject');
    form.set('returnTo', `/admin/indents/${fixture.id}`);

    const res = await fetch(url, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, origin: BASE }, body: form,
    });

    const [after] = await db.select().from(indents).where(eq(indents.id, fixture.id)).limit(1);
    const rejects = await db.select().from(indentEvents)
      .where(and(eq(indentEvents.indentId, fixture.id), eq(indentEvents.stage, 'REJECT')));

    console.log(`\n  POST         -> ${res.status} ${res.headers.get('location') ?? ''}`);
    console.log(`  status now   -> ${after.status}`);
    console.log(`  REJECT events-> ${rejects.length}${rejects[0] ? ` by ${rejects[0].actorNameSnapshot}` : ''}`);
    console.log(after.status === 'REJECTED' && rejects.length === 1
      ? '\n  PASS  Reject works end to end.\n'
      : '\n  FAIL  Reject did not take effect.\n');
  } finally {
    await db.update(people).set({ mustChangePassword: original }).where(eq(people.id, admin.id));
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    await db.delete(indents).where(eq(indents.requesterName, MARKER));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
