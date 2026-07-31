'use client';

import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { LogOut, UserRound } from 'lucide-react';
import { signOut } from '@/actions/auth';
import { ROLE_LABELS } from '@/lib/rbac';
import type { UserRole } from '@/db/schema';
import { cn } from '@/components/ui';

/*
 * Who is signed in, and how to stop being signed in.
 *
 * This is what replaced the "acting as" picker. The difference is not cosmetic:
 * the picker let anyone choose whose name went on an approval, which is exactly
 * the thing the approval structure exists to prevent. This states who you are;
 * it does not offer to change it.
 */

export interface BadgeUser {
  name: string;
  designation: string;
  role: UserRole;
}

/** The two-letter monogram. Initials of the first and last word, so "Saurabh"
 *  gives SA and "Ramesh Kumar" gives RK. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Reads the enclosing form's state, which is why it is its own component —
 *  `useFormStatus` reports on the form above it, not the one beside it. */
function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface text-xs font-medium transition-colors',
        pending ? 'text-muted' : 'text-ink hover:bg-danger-soft hover:text-danger',
      )}
    >
      <LogOut size={14} aria-hidden />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

export function UserBadge({
  user,
  compact = false,
}: {
  user: BadgeUser;
  compact?: boolean;
}) {
  const avatar = (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary"
    >
      {initials(user.name)}
    </span>
  );

  if (compact) {
    return (
      <Link
        href="/profile"
        title={`${user.name} — ${ROLE_LABELS[user.role]}`}
        className="flex items-center gap-2"
      >
        {avatar}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-sunken p-3">
      <Link
        href="/profile"
        className="flex min-w-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-ink">
            {user.name}
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted">
            {ROLE_LABELS[user.role]}
          </span>
        </span>
      </Link>

      <div className="mt-2.5 flex items-center gap-1.5">
        <Link
          href="/profile"
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface text-xs font-medium text-ink transition-colors hover:bg-raised"
        >
          <UserRound size={14} aria-hidden />
          Profile
        </Link>

        {/*
         * The server action passed straight to `action`, rather than wrapped in
         * a click handler. That is what keeps sign-out working when the
         * JavaScript on this page has failed to load — the browser posts the
         * form the ordinary way.
         */}
        <form action={signOut} className="flex-1">
          <SignOutButton />
        </form>
      </div>
    </div>
  );
}
