'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Check, KeyRound, X } from 'lucide-react';
import { resetUserPassword } from '@/actions/users';
import { setUserActive, setUserGrant, updateUserRole } from '@/actions/users';
import { ROLE_LABELS } from '@/lib/rbac';
import { shouldCloseAfter, type ActionResult } from '@/lib/action-state';
import type { UserRole } from '@/db/schema';
import { PasswordField } from '@/components/login-form';
import { Alert, Badge, Button, buttonClass, cn, selectClass } from '@/components/ui';

/*
 * The interactive cells of the Users table.
 *
 * Each control writes through a server action and re-checks the permission
 * there. What is rendered here only decides what is easy to reach; it is not
 * what makes any rule hold.
 */

/** Grant or withdraw one of the two extra decision rights. */
export function GrantToggle({
  personId,
  grant,
  granted,
  label,
  disabled,
}: {
  personId: string;
  grant: 'canApprove' | 'canReject';
  granted: boolean;
  label: string;
  /** True for a Super Admin, whose role already carries the right — the toggle
   *  would appear to withdraw something it cannot. */
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return (
      <span
        title="Granted by the Super Admin role — cannot be withdrawn separately"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success-soft px-2.5 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-200"
      >
        <Check size={13} aria-hidden />
        Role
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={granted}
      title={granted ? `Withdraw: may ${label}` : `Grant: may ${label}`}
      onClick={() => startTransition(() => setUserGrant(personId, grant, !granted))}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
        granted
          ? 'bg-success-soft text-green-800 ring-1 ring-inset ring-green-200 hover:bg-green-100'
          : 'bg-raised text-muted ring-1 ring-inset ring-line hover:text-ink',
      )}
    >
      {pending ? '…' : granted ? (
        <>
          <Check size={13} aria-hidden />
          Yes
        </>
      ) : (
        <>
          <X size={13} aria-hidden />
          No
        </>
      )}
    </button>
  );
}

export function RolePicker({
  personId,
  role,
  isSelf,
}: {
  personId: string;
  role: UserRole;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={role}
      disabled={pending || isSelf}
      // Changing your own role is how somebody locks themselves out of the
      // screen they are standing on. The server refuses to remove the last
      // Super Admin regardless; this stops the more ordinary mistake.
      title={isSelf ? 'You cannot change your own role' : undefined}
      onChange={(e) =>
        startTransition(() => updateUserRole(personId, e.target.value as UserRole))
      }
      className={cn(selectClass, 'h-8 w-44 text-xs')}
    >
      {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

export function ActiveToggle({
  personId,
  isActive,
  isSelf,
}: {
  personId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Disabled'}</Badge>
      {!isSelf && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setUserActive(personId, !isActive))}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
        >
          {pending ? '…' : isActive ? 'Disable' : 'Enable'}
        </button>
      )}
    </span>
  );
}

/**
 * Set someone else's password.
 *
 * In a dialog rather than inline: it is the one action on this row that cannot
 * be undone by clicking it again, and it ends every session that person holds.
 */
export function ResetPassword({ personId, name }: { personId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    resetUserPassword,
    {},
  );

  // Success has to be stated, not inferred from the absence of errors — the
  // initial state is also error-free, and reading it as success would close the
  // dialog the instant it opened.
  useEffect(() => {
    if (shouldCloseAfter(state)) setOpen(false);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-raised"
      >
        <KeyRound size={13} aria-hidden />
        Reset
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-gray-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Reset password for ${name}`}
            className="w-full max-w-md animate-sheet-up rounded-t-2xl border border-line bg-surface p-5 text-left shadow-[var(--shadow-overlay)] sm:animate-rise-in sm:rounded-2xl sm:p-6"
          >
            <h2 className="text-base font-semibold text-ink">Reset {name}’s password</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              They will be signed out everywhere and asked to choose their own the next
              time they sign in.
            </p>

            <form action={formAction} className="mt-5 flex flex-col gap-4">
              <input type="hidden" name="personId" value={personId} />

              {state.error && <Alert tone="danger">{state.error}</Alert>}

              <fieldset disabled={isPending} className="contents">
                <PasswordField
                  name="password"
                  label="New password"
                  autoComplete="new-password"
                  autoFocus
                  error={state.fieldErrors?.password}
                  hint="At least 12 characters. Tell it to them yourself — it is not emailed."
                />
                <PasswordField
                  name="confirmPassword"
                  label="Confirm password"
                  autoComplete="new-password"
                  error={state.fieldErrors?.confirmPassword}
                />

                <div className="flex gap-2">
                  <Button type="submit" tone="primary" className="flex-1">
                    {isPending ? 'Saving…' : 'Set password'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className={buttonClass('secondary', 'md')}
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
