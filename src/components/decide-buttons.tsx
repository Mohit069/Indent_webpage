'use client';

import { useActionState, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Check, PackageCheck, X, Loader2 } from 'lucide-react';
import { transitionIndent, type IndentActionState } from '@/actions/indents';
import { shouldCloseAfter } from '@/lib/action-state';
import type { TransitionRule } from '@/lib/workflow';
import { buttonClass, cn } from '@/components/ui';

/*
 * Deciding an indent, and closing it off once the material arrives.
 *
 * Two shapes, chosen by whether the action asks "are you sure":
 *
 *   Approve  — a confirmation dialog.
 *   Complete — a confirmation dialog.
 *   Reject   — one click, no dialog, no reason asked for.
 *
 * Approve used to ask for a shared password instead. That password was the
 * whole authorisation control when there was no sign-in; now that accounts
 * exist, rbac decides who may approve and the password protected nothing. The
 * dialog survives without it because Approve and Reject sit side by side,
 * approving commits money, and it is the one that cannot be undone by raising
 * the indent again. That is a guard against the wrong button, not the wrong
 * person.
 *
 * Used both inline on the indent list and on the indent's own page, so the two
 * behave identically — there is one way to decide an indent, not two.
 */

function ActionIcon({ action }: { action: string }) {
  if (action === 'approve') return <Check size={16} aria-hidden />;
  if (action === 'complete') return <PackageCheck size={16} aria-hidden />;
  return <X size={16} aria-hidden />;
}

/**
 * What the confirmation dialog says, per action.
 *
 * Approve and Complete are both one-way, but they are one-way about different
 * things, and a dialog that says "this clears it for purchase" over a button
 * that records a delivery is worse than no dialog at all — it is the sentence
 * somebody reads instead of thinking.
 */
const CONFIRM_COPY: Record<string, (actorName: string) => string> = {
  approve: (who) => `This clears it for purchase and cannot be undone. Recorded against ${who}.`,
  complete: (who) =>
    `Only once the material has arrived and been checked. This closes the indent for good — recorded against ${who}.`,
};

/** The button inside the dialog, which carries out the confirmed action. */
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
            rule.confirm ? (
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
              {(CONFIRM_COPY[active.action] ?? CONFIRM_COPY.approve)(actorName)}
            </p>

            <form action={formAction} className="mt-5 flex flex-col gap-4">
              {hidden(active.action)}

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
