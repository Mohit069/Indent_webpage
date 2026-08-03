import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from '@/components/login-form';

/*
 * Sign in.
 *
 * Outside the (app) route group on purpose: the shell it provides has a sidebar
 * and a user menu, neither of which means anything to somebody who is not
 * signed in yet.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in — Purchase Indent',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Already signed in — send them on rather than showing a form they do not
  // need. Super Admins land in the admin dashboard, everyone else in the list.
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'SUPER_ADMIN' ? '/admin' : '/indents');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-base font-bold tracking-tight text-primary-ink"
          >
            MQ
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink">Purchase Indent</h1>
            <p className="mt-0.5 text-sm text-muted">Artizia Quartz</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <LoginForm returnTo={next} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          No account? Ask Saurabh to create one for you.
        </p>
      </div>
    </main>
  );
}
