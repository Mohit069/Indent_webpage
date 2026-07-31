import { requireUser } from '@/lib/guard';
import { ChangePasswordForm } from '@/components/change-password-form';
import { Alert } from '@/components/ui';

/*
 * Change your own password.
 *
 * Outside the (app) shell because it is also the wall a forced change puts in
 * front of everything else. Rendering it inside the sidebar would show links to
 * pages the person is not yet meant to reach.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Change password — Purchase Indent',
};

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const forced = user.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold text-ink">
            {forced ? 'Choose a password' : 'Change your password'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as {user.name}
            {user.email ? ` (${user.email})` : ''}
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          {forced && (
            <Alert tone="warning" title="Set your own password before continuing">
              The one you signed in with was set for you, so somebody else knows it.
            </Alert>
          )}

          <ChangePasswordForm forced={forced} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          Changing it signs you out everywhere else.
        </p>
      </div>
    </main>
  );
}
