'use client';

import { useTransition } from 'react';
import { setPersonActive } from '@/actions/admin';
import { Badge } from '@/components/ui';

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
