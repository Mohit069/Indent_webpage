import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/guard';
import { toPrincipal } from '@/lib/rbac';
import { AppShell } from '@/components/app-shell';

/*
 * The gate for everything in this group.
 *
 * A layout is the right place for it: it runs before any page inside it, so
 * there is no route under (app) that can be reached without a session. The
 * pages still check their own permissions — a layout can only answer "is
 * anybody signed in", not "may this person open this".
 */

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // A password an admin set is one two people know. Nothing else is reachable
  // until it has been replaced.
  if (user.mustChangePassword) redirect('/change-password');

  // Read here rather than in the client, so the sidebar paints at its remembered
  // width instead of rendering wide and snapping narrow after hydration.
  const jar = await cookies();
  const collapsed = jar.get('sidebar_collapsed')?.value === '1';

  return (
    <AppShell
      user={{ name: user.name, designation: user.designation, role: user.role }}
      principal={toPrincipal(user)}
      defaultCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
