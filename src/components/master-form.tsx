'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import { Field, Input, Select, buttonClass } from '@/components/ui';

/*
 * One form for the simple masters.
 *
 * Departments, units, categories and users differ only in their fields, so they
 * share a component rather than four near-identical files that drift apart.
 */

/**
 * What this form can render a result from.
 *
 * Wider than any one action's return type, because two families of action feed
 * it — the master-data ones, which report a `success` message, and the newer
 * ones built on ActionResult, which state `ok`. Every field is optional, so
 * both satisfy it without either having to change shape.
 */
export interface MasterFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  ok?: true;
}

export interface MasterField {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'password' | 'select' | 'checkbox';
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
  action: (prev: MasterFormState, formData: FormData) => Promise<MasterFormState>;
  fields: MasterField[];
  submitLabel: string;
  columns?: 2 | 3;
}) {
  const [state, formAction] = useActionState<MasterFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div
        className={`grid gap-5 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}
      >
        {fields.map((f) =>
          f.type === 'checkbox' ? (
            /*
             * Its own shape, not a Field: a checkbox reads as label-after-control,
             * and the hint belongs under the pair rather than under the box.
             */
            <label
              key={f.name}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-sunken px-3.5 py-3"
            >
              <input
                type="checkbox"
                name={f.name}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{f.label}</span>
                {f.hint && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {f.hint}
                  </span>
                )}
              </span>
            </label>
          ) : (
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
                <Input
                  name={f.name}
                  type={
                    f.type === 'email' ? 'email' : f.type === 'password' ? 'password' : 'text'
                  }
                  // So the browser offers to generate one and does not file it
                  // under the admin's own saved credentials.
                  autoComplete={f.type === 'password' ? 'new-password' : undefined}
                  placeholder={f.placeholder}
                />
              )}
            </Field>
          ),
        )}
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
