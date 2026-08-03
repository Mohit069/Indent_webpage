import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { indents } from '@/db/schema';
import { requireUser } from '@/lib/guard';
import { canAny, toPrincipal } from '@/lib/rbac';
import { AdminShell } from '@/components/admin-shell';

/*
 * The gate for the whole admin area.
 *
 * Being signed in is not enough — an HOD reaching /admin should be turned away,
 * not shown an empty sidebar. The test is whether any admin page is open to
 * them at all; each page then checks its own permission, because this layout
 * cannot know which one they are heading for.
 *
 * `canAny` rather than a role comparison. Appointing a second Super Admin, or
 * inventing a fourth role that may read reports, then needs no change here.
 */

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  if (user.mustChangePassword) redirect('/change-password');

  const principal = toPrincipal(user);

  const mayEnter = canAny(principal, [
    'indent:view:all',
    'user:manage',
    'department:manage',
    'report:view',
    'masters:manage',
  ]);

  if (!mayEnter) redirect('/denied');

  const [jar, pendingRow] = await Promise.all([
    cookies(),
    db
      .select({ n: count() })
      .from(indents)
      .where(and(eq(indents.status, 'PENDING_APPROVAL'))),
  ]);

  return (
    <AdminShell
      user={{ name: user.name, designation: user.designation, role: user.role }}
      principal={principal}
      pendingCount={pendingRow[0]?.n ?? 0}
      defaultCollapsed={jar.get('sidebar_collapsed')?.value === '1'}
    >
      {children}
    </AdminShell>
  );
}
