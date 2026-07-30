'use client';

import { useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import { setActingAs } from '@/actions/indents';
import type { Person } from '@/db/schema';
import { selectClass } from '@/components/ui';

/*
 * The pinned identity.
 *
 * Deliberately NOT a permanently-open dropdown. This machine has been set to
 * one person, and that is displayed as plain text — a loose select is easy to
 * nudge by accident, and a nudged select means an indent printed under the
 * wrong name. Changing it takes a click, which is the right amount of friction
 * for something that should change roughly never.
 *
 * It is not a login: no password, nothing verified, and switching grants
 * nothing that was not already reachable.
 */
export function ActingAs({
  people,
  current,
}: {
  people: Person[];
  current: Person | null;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  if (people.length === 0) {
    return (
      <a
        href="/admin/people"
        className="text-xs font-medium text-primary hover:underline"
      >
        Add people →
      </a>
    );
  }

  if (editing) {
    return (
      <div className="relative">
        <select
          autoFocus
          defaultValue={current?.id ?? ''}
          disabled={pending}
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            const id = e.target.value;
            setEditing(false);
            startTransition(() => setActingAs(id));
          }}
          aria-label="Change who this computer is set to"
          className={`${selectClass} h-9 max-w-[15rem] truncate text-xs`}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.designation}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight text-ink">
          {current?.name ?? 'Not set'}
        </p>
        <p className="truncate text-xs leading-tight text-muted">
          {current?.designation ?? 'this computer'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        className="shrink-0 rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
      >
        {pending ? '…' : 'Change'}
      </button>
    </div>
  );
}
