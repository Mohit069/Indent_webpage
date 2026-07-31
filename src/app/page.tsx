import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

/**
 * Where "/" goes.
 *
 * Depends on who is asking. A Super Admin lands in the admin dashboard rather
 * than the indent list — the requirement is explicit that Saurabh should not
 * open into the HOD interface — and everyone else lands in the indents.
 */
export default async function RootPage() {
  const user = await getCurrentUser();

  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/change-password');

  redirect(user.role === 'SUPER_ADMIN' ? '/admin' : '/indents');
}
