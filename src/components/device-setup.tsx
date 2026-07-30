'use client';

import { useTransition, useState } from 'react';
import { Check } from 'lucide-react';
import { setActingAs } from '@/actions/indents';
import type { Person } from '@/db/schema';
import { cn } from '@/components/ui';

/*
 * First run on a computer.
 *
 * Not a login — there is no password and nothing is verified. It is a one-time
 * setup question, asked once per machine and then never again, so that the name
 * printed on every indent from this computer is right by default rather than by
 * somebody remembering to change a dropdown.
 *
 * Asked rather than guessed on purpose: silently defaulting to the first person
 * on the list is exactly how the wrong name ends up on a printed indent.
 */
export function DeviceSetup({ people }: { people: Person[] }) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-ink"
          >
            MQ
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">
              Purchase Indent
            </p>
            <p className="text-xs leading-tight text-muted">
              Marudhar Quartz Surfaces
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-raised)]">
          <h1 className="text-lg font-bold tracking-tight text-ink">
            Who uses this computer?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Whoever you pick is the name printed on indents raised and approved here.
            It is asked once per computer — not a login, and there is no password.
          </p>

          <ul className="mt-5 flex flex-col gap-2">
            {people.map((p) => {
              const picked = chosen === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setChosen(p.id);
                      startTransition(() => setActingAs(p.id));
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 disabled:opacity-60',
                      picked
                        ? 'border-primary bg-primary-soft'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-raised',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {p.designation}
                      </span>
                    </span>
                    {picked && (
                      <Check size={16} className="shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          You can change it later from the sidebar. If a name is missing, add it under
          Settings → People — you will need to pick someone here first.
        </p>
      </div>
    </main>
  );
}
