import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/rbac';
import { ButtonLink } from '@/components/ui';

/*
 * Signed in, but not allowed.
 *
 * A distinct page from sign-in, because bouncing somebody back to a login form
 * they have already completed reads as a broken application rather than as a
 * refusal. This says plainly what happened and who they are, so they can tell
 * whether they are on the wrong account or simply lack the permission.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Not allowed — Purchase Indent',
};

export default async function DeniedPage() {
  const user = await getCurrentUser();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <ShieldOff size={22} aria-hidden />
        </div>

        <h1 className="mt-5 text-lg font-semibold text-ink">
          That page is not yours to open
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-muted">
          {user ? (
            <>
              You are signed in as <span className="font-medium text-ink">{user.name}</span>,
              a {ROLE_LABELS[user.role].toLowerCase()}. That role does not include this
              page.
            </>
          ) : (
            'You are not signed in.'
          )}
        </p>

        <div className="mt-7 flex items-center justify-center gap-3">
          <ButtonLink href={user?.role === 'SUPER_ADMIN' ? '/admin' : '/indents'} tone="primary">
            Back to your work
          </ButtonLink>
          <Link
            href="/login"
            className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Sign in as someone else
          </Link>
        </div>
      </div>
    </main>
  );
}
