'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff, Check, X, Loader2 } from 'lucide-react';
import { transitionIndent, type IndentActionState } from '@/actions/indents';
import { shouldCloseAfter } from '@/lib/action-state';
import type { TransitionRule } from '@/lib/workflow';
import { buttonClass, cn } from '@/components/ui';

/*
 * Deciding an indent.
 *
 * Two shapes, chosen by whether the action needs the shared password:
 *
 *   Approve — opens a dialog, because a password has to be typed somewhere.
 *   Reject  — one click, no dialog, no reason asked for.
 *
 * The asymmetry is deliberate. Approving commits money; rejecting does not,
 * and the indent can be raised again. What stands behind Reject is the
 * canReject permission, checked on the server before anything is written.
 *
 * Used both inline on the indent list and on the indent's own page, so the two
 * behave identically — there is one way to decide an indent, not two.
 */

/*
 * The password box, with a reveal toggle.
 *
 * Dots are the right default — this is a shared office machine and someone is
 * usually standing at the next desk. But a mistyped password that you cannot
 * see is guesswork, so the toggle is there for when you need it.
 *
 * The input is never remounted when it flips, only its `type` changes, so what
 * you have typed stays put. That also matters after a wrong password: the
 * dialog stays open with the attempt still in the box, ready to be corrected.
 */
function PasswordField({ error }: { error?: string }) {
  const [shown, setShown] = useState(false);
  // One list page renders a DecideButtons per row, so the id has to be unique.
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        Password
        <span className="ml-0.5 text-danger" aria-hidden>
          *
        </span>
      </label>

      <div className="relative">
        <input
          id={fieldId}
          name="password"
          type={shown ? 'text' : 'password'}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Shared approval password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'h-11 w-full rounded-lg border bg-surface pl-3.5 pr-12 text-sm text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:outline-none',
            error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-red-100'
              : 'border-line-strong hover:border-gray-400 focus:border-primary focus:ring-2 focus:ring-[var(--primary-soft)]',
          )}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-controls={fieldId}
          // Named for what pressing it does, not for the icon it happens to show.
          aria-label={shown ? 'Hide password' : 'Show password'}
          title={shown ? 'Hide password' : 'Show password'}
          className="absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-md text-faint transition-colors hover:bg-raised hover:text-ink"
        >
          {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>

      {error && (
        <span
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-xs font-medium text-danger"
        >
          <X size={13} aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  return action === 'approve' ? (
    <Check size={16} aria-hidden />
  ) : (
    <X size={16} aria-hidden />
  );
}

/** The button inside the dialog, which confirms a password-gated action. */
function ConfirmButton({ rule }: { rule: TransitionRule }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(
        rule.tone === 'danger' ? 'danger' : 'primary',
        'md',
        'flex-1',
      )}
    >
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Working…
        </>
      ) : (
        <>
          <ActionIcon action={rule.action} />
          {rule.label}
        </>
      )}
    </button>
  );
}

/** A button that performs its action on the click itself — no dialog. */
function ImmediateButton({
  rule,
  size,
}: {
  rule: TransitionRule;
  size: 'sm' | 'md';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(
        rule.tone === 'danger' ? 'secondary' : 'primary',
        size,
        rule.tone === 'danger'
          ? 'border-line-strong text-danger hover:border-red-200 hover:bg-danger-soft'
          : undefined,
      )}
    >
      {pending ? (
        <>
          <Loader2 size={size === 'sm' ? 13 : 16} className="animate-spin" aria-hidden />
          Working…
        </>
      ) : (
        rule.label
      )}
    </button>
  );
}

export function DecideButtons({
  indentId,
  indentNo,
  actions,
  actorName,
  size = 'md',
}: {
  indentId: string;
  indentNo: string | null;
  actions: TransitionRule[];
  actorName: string;
  size?: 'sm' | 'md';
}) {
  const [state, formAction] = useActionState<IndentActionState, FormData>(
    transitionIndent,
    {},
  );
  const [active, setActive] = useState<TransitionRule | null>(null);
  // So the confirmation appears on the page you were already looking at.
  const pathname = usePathname();

  /*
   * Close only once the action has actually completed.
   *
   * The obvious version of this — "no errors, so it worked" — closed the dialog
   * the moment it opened, because useActionState's initial state is also
   * error-free. Success has to be stated, not inferred.
   */
  useEffect(() => {
    if (shouldCloseAfter(state)) setActive(null);
  }, [state]);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActive(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  if (actions.length === 0) return null;

  const hidden = (action: string) => (
    <>
      <input type="hidden" name="indentId" value={indentId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value={pathname} />
    </>
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          {actions.map((rule) =>
            rule.requiresPassword ? (
              <button
                key={rule.action}
                type="button"
                onClick={() => setActive(rule)}
                className={buttonClass('primary', size)}
              >
                {rule.label}
              </button>
            ) : (
              <form key={rule.action} action={formAction}>
                {hidden(rule.action)}
                <ImmediateButton rule={rule} size={size} />
              </form>
            ),
          )}
        </div>

        {/*
          Errors from an immediate action have nowhere else to surface — there
          is no dialog left open to hold them.
        */}
        {!active && state.error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-red-900"
          >
            {state.error}
          </p>
        )}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-gray-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActive(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${active.label} indent`}
            className="w-full max-w-md animate-sheet-up rounded-t-2xl border border-line bg-surface p-5 shadow-[var(--shadow-overlay)] sm:animate-rise-in sm:rounded-2xl sm:p-6"
          >
            <h2 className="text-base font-semibold text-ink">
              {active.label} {indentNo ?? 'this indent'}?
            </h2>
            <p className="mt-1 text-sm text-muted">
              This clears it for purchase. Recorded against {actorName}.
            </p>

            <form action={formAction} className="mt-5 flex flex-col gap-4">
              {hidden(active.action)}

              <PasswordField error={state.fieldErrors?.password} />

              {state.error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-red-900"
                >
                  {state.error}
                </p>
              )}

              <div className="flex gap-2">
                <ConfirmButton rule={active} />
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className={buttonClass('secondary', 'md')}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
