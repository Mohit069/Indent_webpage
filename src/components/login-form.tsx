'use client';

import { useActionState, useId, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { signIn } from '@/actions/auth';
import { Alert, Button, Field, Input, Label, cn, inputClass } from '@/components/ui';
import type { ActionResult } from '@/lib/action-state';

/**
 * A password box with a reveal toggle.
 *
 * Deliberately not built on `Field`, which wraps its children in a `<label>`.
 * The reveal control is a button, and a button inside a label is both an
 * accessibility problem and a practical one — clicking it activates the label
 * as well, so the toggle competes with focusing the input.
 *
 * Exported because sign-in, change-password and admin reset all need it, and
 * three hand-rolled copies is three chances for one to forget `autoComplete`
 * and have the browser offer the wrong saved password.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  error,
  hint,
  autoFocus,
  required = true,
}: {
  name: string;
  label: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const describedBy = `${id}-note`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? describedBy : undefined}
          className={cn(inputClass, 'pr-11')}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          // The current state matters more than the icon to anyone using a
          // screen reader, and "Show password" alone never says which it is now.
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-faint transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
        >
          {revealed ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
        </button>
      </div>

      {error ? (
        <span id={describedBy} role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : (
        hint && (
          <span id={describedBy} className="text-xs leading-relaxed text-muted">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    signIn,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      {/* `contents` so disabling the group does not alter the layout. */}
      <fieldset disabled={isPending} className="contents">
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
          />
        </Field>

        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          error={state.fieldErrors?.password}
        />

        <Button type="submit" tone="primary" size="lg" className="mt-1 w-full">
          <LogIn size={17} aria-hidden />
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </fieldset>
    </form>
  );
}
