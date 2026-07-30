import { CheckCircle2, XCircle, Send } from 'lucide-react';

/*
 * "It worked" — said out loud.
 *
 * A dialog that simply disappears leaves you unsure whether the password was
 * even accepted, and a status chip quietly changing colour in a table row is
 * easy to miss. The outcome arrives as a query parameter so it survives the
 * re-render that follows the decision.
 */

const OUTCOMES = {
  approve: {
    title: 'Approved',
    detail: 'It can now be procured.',
    icon: CheckCircle2,
    className: 'border-green-200 bg-success-soft text-green-900',
    iconClassName: 'text-success',
  },
  reject: {
    title: 'Rejected',
    detail: 'The reason you gave is on its history.',
    icon: XCircle,
    className: 'border-red-200 bg-danger-soft text-red-900',
    iconClassName: 'text-danger',
  },
  submit: {
    title: 'Submitted',
    detail: 'It is now waiting for approval.',
    icon: Send,
    className: 'border-amber-200 bg-warning-soft text-amber-900',
    iconClassName: 'text-amber-600',
  },
} as const;

export function DecisionBanner({
  decided,
  indentNo,
}: {
  decided?: string;
  indentNo?: string;
}) {
  const outcome = OUTCOMES[decided as keyof typeof OUTCOMES];
  if (!outcome) return null;

  const Icon = outcome.icon;

  return (
    <div
      role="status"
      className={`flex animate-rise-in items-start gap-3 rounded-xl border px-4 py-3.5 ${outcome.className}`}
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${outcome.iconClassName}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {outcome.title}
          {indentNo ? (
            <span className="font-mono text-[13px] font-medium"> — {indentNo}</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm opacity-90">{outcome.detail}</p>
      </div>
    </div>
  );
}
