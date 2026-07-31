'use client';

import { useActionState } from 'react';
import { KeyRound } from 'lucide-react';
import { changePassword } from '@/actions/auth';
import { PasswordField } from '@/components/login-form';
import { Alert, Button } from '@/components/ui';
import type { ActionResult } from '@/lib/action-state';

/**
 * Change your own password.
 *
 * `forced` drops the current-password box. When an admin has reset the
 * password, the person is signing in with one two people know, and proving they
 * know it demonstrates nothing — asking for it would be theatre.
 */
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    changePassword,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <fieldset disabled={isPending} className="contents">
        {!forced && (
          <PasswordField
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
            autoFocus
            error={state.fieldErrors?.currentPassword}
          />
        )}

        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          autoFocus={forced}
          error={state.fieldErrors?.password}
          hint="At least 12 characters. Length matters more than symbols."
        />

        <PasswordField
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          error={state.fieldErrors?.confirmPassword}
        />

        <Button type="submit" tone="primary" size="lg" className="mt-1 w-full">
          <KeyRound size={17} aria-hidden />
          {isPending ? 'Saving…' : 'Set password'}
        </Button>
      </fieldset>
    </form>
  );
}
