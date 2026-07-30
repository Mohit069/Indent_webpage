'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import type { AdminActionState } from '@/actions/admin';
import { Field, Input, Select, buttonClass } from '@/components/ui';

/*
 * One form for the simple masters.
 *
 * People, departments, units and categories differ only in their fields, so
 * they share a component rather than four near-identical files that drift
 * apart.
 */

export interface MasterField {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Adding…
        </>
      ) : (
        <>
          <Plus size={16} aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}

export function MasterForm({
  action,
  fields,
  submitLabel,
  columns = 3,
}: {
  action: (prev: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  fields: MasterField[];
  submitLabel: string;
  columns?: 2 | 3;
}) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div
        className={`grid gap-5 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}
      >
        {fields.map((f) => (
          <Field
            key={f.name}
            label={f.label}
            hint={f.hint}
            error={state.fieldErrors?.[f.name]}
            required={f.required}
          >
            {f.type === 'select' ? (
              <Select name={f.name} defaultValue="">
                <option value="">— none —</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input name={f.name} placeholder={f.placeholder} />
            )}
          </Field>
        ))}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-danger-soft px-3.5 py-2.5 text-sm text-red-900"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-success-soft px-3.5 py-2.5 text-sm text-green-900">
          <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
          {state.success}
        </p>
      )}

      <div>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
