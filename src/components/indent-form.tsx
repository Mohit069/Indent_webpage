'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { saveIndent, type IndentActionState } from '@/actions/indents';
import { describeMissing } from '@/lib/form-summary';
import {
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  Select,
  Textarea,
  buttonClass,
} from '@/components/ui';
import {
  LineEditor,
  type EditorItem,
  type EditorLine,
  type EditorUom,
} from '@/components/line-editor';

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Sending…
        </>
      ) : (
        <>
          <Send size={16} aria-hidden />
          Send for approval
        </>
      )}
    </button>
  );
}

export function IndentForm({
  items,
  uoms,
  departments,
  requesterSuggestions,
  initial,
}: {
  items: EditorItem[];
  uoms: EditorUom[];
  /** Existing department names, offered as you type. Not a closed list. */
  departments: string[];
  requesterSuggestions: string[];
  initial?: {
    id: string;
    indentDate: string;
    departmentName: string;
    requesterName: string;
    requesterDesignation: string;
    purpose: string;
    expectedDate: string;
    priority: string;
    lines: EditorLine[];
  };
}) {
  const [state, formAction] = useActionState<IndentActionState, FormData>(
    saveIndent,
    {},
  );

  const today = new Date().toISOString().slice(0, 10);
  const missing = describeMissing(state.fieldErrors);
  const summaryRef = useRef<HTMLDivElement>(null);

  /*
   * Take them to the warning.
   *
   * On a form this tall the field that failed is usually off-screen, so
   * pressing the button appeared to do nothing at all. Focus rather than a bare
   * scroll, so a screen reader announces it too.
   */
  useEffect(() => {
    if (missing.length === 0 && !state.error) return;
    summaryRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    summaryRef.current?.focus();
  }, [state, missing.length]);

  /* Line errors arrive as `lines.<row>.<field>`; the editor wants `<row>.<field>`. */
  const lineErrors: Record<string, string> = {};
  for (const [path, message] of Object.entries(state.fieldErrors ?? {})) {
    const m = /^lines\.(\d+)\.(.+)$/.exec(path);
    if (m) lineErrors[`${m[1]}.${m[2]}`] = message;
  }
  const linesLevelError = state.fieldErrors?.lines;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {initial && <input type="hidden" name="indentId" value={initial.id} />}

      {(missing.length > 0 || state.error) && (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="scroll-mt-24 rounded-xl border border-amber-200 bg-warning-soft px-4 py-3.5 text-amber-900 outline-none"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={16} className="shrink-0 text-amber-600" aria-hidden />
            {state.error ?? 'This indent is not ready to send yet'}
          </p>
          {missing.length > 0 && (
            <>
              <p className="mt-1 text-sm">
                {missing.length === 1
                  ? 'One thing still needs filling in:'
                  : `${missing.length} things still need filling in:`}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {missing.map((label) => (
                  <li
                    key={label}
                    className="rounded-md bg-white/70 px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-amber-200"
                  >
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-xs">
                Each one is marked in red below. Fill them in, then press Send for
                approval again — nothing has been saved yet.
              </p>
            </>
          )}
        </div>
      )}

      <Card>
        <CardHeader
          title="Indent details"
          description="Who needs the material, for which department, and by when."
        />
        <CardBody>
          {/* Two columns on desktop, one on phones. Wide fields opt out below. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Date"
              hint="Leave it as today unless you are recording an older indent."
              error={state.fieldErrors?.indentDate}
            >
              <Input
                name="indentDate"
                type="date"
                defaultValue={initial?.indentDate ?? today}
              />
            </Field>

            <Field
              label="Department"
              hint="Which department needs this."
              error={state.fieldErrors?.departmentName}
              required
            >
              <Input
                name="departmentName"
                list="department-names"
                defaultValue={initial?.departmentName ?? ''}
                placeholder="e.g. Maintenance"
              />
              <datalist id="department-names">
                {departments.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>

            <Field
              label="Requester name"
              hint="The person who needs the material."
              error={state.fieldErrors?.requesterName}
              required
            >
              <Input
                name="requesterName"
                list="requester-names"
                defaultValue={initial?.requesterName ?? ''}
              />
              <datalist id="requester-names">
                {requesterSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>

            <Field
              label="Requester designation"
              hint="Optional — printed under their name on the indent."
              error={state.fieldErrors?.requesterDesignation}
            >
              <Input
                name="requesterDesignation"
                defaultValue={initial?.requesterDesignation ?? ''}
              />
            </Field>

            <Field
              label="Priority"
              hint="How soon it is actually needed. Pick the honest one — ASAP means today."
              error={state.fieldErrors?.priority}
            >
              <Select name="priority" defaultValue={initial?.priority ?? 'LEVEL_3'}>
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Expected date"
              hint="Optional — when the material is needed by."
              error={state.fieldErrors?.expectedDate}
            >
              <Input
                name="expectedDate"
                type="date"
                defaultValue={initial?.expectedDate ?? ''}
              />
            </Field>

            <Field
              label="Remarks / purpose"
              hint="Why this material is needed, and for which machine or line."
              error={state.fieldErrors?.purpose}
              className="sm:col-span-2"
            >
              <Textarea
                name="purpose"
                rows={3}
                defaultValue={initial?.purpose ?? ''}
                placeholder="e.g. Line 2 polishing head is seizing — bearing and belt need replacing before the next shift."
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Items"
          description="Type the item name — anything already in the item master is offered as you type. Each row needs a name and a quantity; the unit defaults to NOS."
        />
        <CardBody>
          <LineEditor
            items={items}
            uoms={uoms}
            initialLines={initial?.lines ?? []}
            errors={lineErrors}
          />
          {linesLevelError && (
            <p role="alert" className="mt-4 text-sm font-medium text-danger">
              {linesLevelError}
            </p>
          )}
        </CardBody>
      </Card>

      {/*
        On phones this rides just above the bottom navigation, so the button is
        always reachable without scrolling back through twelve item rows.
      */}
      <div className="sticky bottom-[4.5rem] z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-filter-none">
        <SendButton />
        <p className="text-xs leading-relaxed text-muted">
          The indent number is issued now, and the items are fixed from this point.
        </p>
      </div>
    </form>
  );
}
