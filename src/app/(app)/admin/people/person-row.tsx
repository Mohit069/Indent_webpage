'use client';

import { useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { setPersonActive, setPersonRole } from '@/actions/admin';
import { Badge, cn } from '@/components/ui';

/**
 * Grant or withdraw one permission.
 *
 * The server re-checks the same flag before it will move an indent, so this
 * toggle decides what is *shown*; it is not what makes the rule hold.
 */
export function RoleToggle({
  personId,
  role,
  granted,
  label,
}: {
  personId: string;
  role: 'canApprove' | 'canReject';
  granted: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={granted}
      title={granted ? `Withdraw: may ${label}` : `Grant: may ${label}`}
      onClick={() => startTransition(() => setPersonRole(personId, role, !granted))}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
        granted
          ? 'bg-success-soft text-green-800 ring-1 ring-inset ring-green-200 hover:bg-green-100'
          : 'bg-raised text-muted ring-1 ring-inset ring-line hover:text-ink',
      )}
    >
      {pending ? (
        '…'
      ) : granted ? (
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

export function PersonRow({
  personId,
  isActive,
}: {
  personId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={isActive ? 'success' : 'neutral'}>
        {isActive ? 'Active' : 'Inactive'}
      </Badge>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setPersonActive(personId, !isActive))}
        className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
      >
        {pending ? '…' : isActive ? 'Deactivate' : 'Reactivate'}
      </button>
    </span>
  );
}
