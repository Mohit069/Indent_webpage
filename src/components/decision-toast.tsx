'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, PackageCheck, XCircle, Send, X } from 'lucide-react';

/*
 * "It worked" — said out loud, then got out of the way.
 *
 * The outcome arrives as a query parameter rather than as component state,
 * because the thing that would have held that state is gone by the time the
 * message needs showing: the row re-renders, the buttons disappear, or the
 * whole page has been replaced by the list. A query parameter survives all
 * three.
 *
 * Rendered on the server as well as the client, so it is in the HTML rather
 * than appearing a frame later — that also keeps it visible to the checks,
 * which read markup and cannot wait for an effect.
 */

const OUTCOMES = {
  approve: {
    title: 'Approved',
    detail: 'It can now be procured. Mark it completed once the material arrives.',
    icon: CheckCircle2,
    className: 'border-green-200 bg-success-soft text-green-900',
    iconClassName: 'text-success',
  },
  complete: {
    title: 'Completed',
    detail: 'Material received and checked. This indent is finished.',
    icon: PackageCheck,
    /*
     * Teal, matching the status chip, and deliberately not the green used for
     * Approved — the two are a fortnight apart in real life and would otherwise
     * be the same flash of the same colour.
     */
    className: 'border-teal-200 bg-teal-50 text-teal-900',
    iconClassName: 'text-teal-700',
  },
  reject: {
    title: 'Rejected',
    detail: 'It is closed. Whoever raised it can raise a new one.',
    icon: XCircle,
    className: 'border-red-200 bg-danger-soft text-red-900',
    iconClassName: 'text-danger',
  },
  submit: {
    title: 'Submitted',
    detail: 'It is now waiting for approval.',
    icon: Send,
    className: 'border-blue-200 bg-primary-soft text-blue-900',
    iconClassName: 'text-primary',
  },
} as const;

/** Long enough to read a number and check it, short enough not to linger. */
const DISMISS_AFTER = 7000;

export function DecisionToast({
  decided,
  indentNo,
}: {
  decided?: string;
  indentNo?: string;
}) {
  const outcome = OUTCOMES[decided as keyof typeof OUTCOMES];
  const [open, setOpen] = useState(true);

  /*
   * Take the parameters out of the address bar once it has been shown.
   *
   * Via history.replaceState rather than router.replace: this is only tidying
   * the URL, and going through the router would re-fetch the page underneath
   * the toast for no reason. Without it, a reload — or a bookmark — would
   * announce a decision that happened some time ago.
   */
  useEffect(() => {
    if (!outcome) return;

    const url = new URL(window.location.href);
    if (url.searchParams.has('decided')) {
      url.searchParams.delete('decided');
      url.searchParams.delete('no');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }

    const timer = setTimeout(() => setOpen(false), DISMISS_AFTER);
    return () => clearTimeout(timer);
  }, [outcome]);

  if (!outcome || !open) return null;

  const Icon = outcome.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:inset-x-auto sm:right-0 sm:justify-end sm:pt-6 sm:pr-6"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md animate-rise-in items-start gap-3 rounded-xl border px-4 py-3.5 shadow-[var(--shadow-overlay)] ${outcome.className}`}
      >
        <Icon
          size={18}
          className={`mt-0.5 shrink-0 ${outcome.iconClassName}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {outcome.title}
            {indentNo ? (
              <span className="font-mono text-[13px] font-medium"> — {indentNo}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm opacity-90">{outcome.detail}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}
