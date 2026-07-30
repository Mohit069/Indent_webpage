'use client';

import { useActionState } from 'react';
import { usePathname } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Send, Loader2, Info } from 'lucide-react';
import { transitionIndent, type IndentActionState } from '@/actions/indents';
import { buttonClass } from '@/components/ui';

/*
 * Submitting a draft.
 *
 * No password — submitting is not an authorisation, it is handing the indent
 * over. The gate is on Approve and Reject, which is where money starts moving.
 *
 * It does get a confirmation, because submitting issues the indent number and
 * freezes the items, and neither of those should happen on a stray click.
 */

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Submitting…
        </>
      ) : (
        <>
          <Send size={16} aria-hidden />
          Submit Indent
        </>
      )}
    </button>
  );
}

export function SubmitBar({
  indentId,
  actorName,
  actorDesignation,
}: {
  indentId: string;
  actorName: string;
  actorDesignation: string;
}) {
  const [state, formAction] = useActionState<IndentActionState, FormData>(
    transitionIndent,
    {},
  );
  const pathname = usePathname();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="indentId" value={indentId} />
      <input type="hidden" name="action" value="submit" />
      <input type="hidden" name="returnTo" value={pathname} />

      <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-primary-soft px-4 py-3">
        <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-medium text-blue-900">
            Submitting as {actorName}, {actorDesignation}.
          </p>
          <p className="mt-0.5 text-sm text-blue-900/80">
            The indent number is issued now, and the items are fixed from this point.
          </p>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-danger-soft px-3 py-2 text-sm text-red-900"
        >
          {state.error}
        </p>
      )}

      <div>
        <Button />
      </div>
    </form>
  );
}
