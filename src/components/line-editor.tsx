'use client';

import { useId, useState } from 'react';
import { Trash2, Plus, Info } from 'lucide-react';
import { cn, inputClass, IconButton } from '@/components/ui';

/*
 * The indent table — the paper form's twelve ruled rows.
 *
 * This is the screen adoption turns on. If entering six items is slower than
 * writing them, people go back to the book. So every column is typed: the item
 * name, the unit, the quantities. The catalog is offered as you type rather
 * than as a list to hunt through, because on a plant floor naming the thing is
 * faster than finding it.
 */

export interface EditorItem {
  id: string;
  code: string;
  name: string;
  specification: string | null;
}

export interface EditorUom {
  id: string;
  code: string;
  name: string;
}

export interface EditorLine {
  customDescription: string;
  uomCode: string;
  balanceQty: string;
  requiredQty: string;
  remarks: string;
}

export function emptyLine(defaultUomCode: string): EditorLine {
  return {
    customDescription: '',
    uomCode: defaultUomCode,
    balanceQty: '',
    requiredQty: '',
    remarks: '',
  };
}

/* Rows are dense by nature, so controls sit one step below the 44px default. */
const cell = cn(inputClass, 'h-10 px-3 text-sm');
const cellNum = cn(cell, 'tabular text-right');

export function LineEditor({
  items,
  uoms,
  initialLines,
  errors,
}: {
  items: EditorItem[];
  uoms: EditorUom[];
  initialLines: EditorLine[];
  /** Keyed by `${rowIndex}.${field}` — see collectFieldErrors. */
  errors?: Record<string, string>;
}) {
  /*
   * The unit a new row starts with.
   *
   * Nos covers most of what this plant indents, so pre-filling it saves a field
   * on nearly every row while still being one keystroke to replace.
   */
  const defaultUom = uoms.find((u) => u.code === 'NOS')?.code ?? uoms[0]?.code ?? '';
  const [lines, setLines] = useState<EditorLine[]>(
    initialLines.length > 0 ? initialLines : [emptyLine(defaultUom)],
  );
  const uomListId = useId();
  const itemListId = useId();

  function update(index: number, patch: Partial<EditorLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(defaultUom)]);
  }

  function removeLine(index: number) {
    setLines((prev) =>
      prev.length === 1 ? [emptyLine(defaultUom)] : prev.filter((_, i) => i !== index),
    );
  }

  const errorFor = (row: number, field: string) => errors?.[`${row}.${field}`];

  /** The lines travel as one JSON field — index-based form names go stale the
   *  instant a middle row is deleted. */
  const payload = JSON.stringify(
    lines
      .filter((l) => l.customDescription || l.requiredQty)
      .map((l) => ({
        customDescription: l.customDescription || undefined,
        uomCode: l.uomCode,
        balanceQty: l.balanceQty || undefined,
        requiredQty: l.requiredQty,
        remarks: l.remarks || undefined,
      })),
  );

  /*
   * Suggestions, not choices.
   *
   * A datalist offers what is already in the item master as you type, without
   * ever standing between you and something that is not in it. The catalog
   * still earns its keep — it just stopped being a gate.
   */
  const suggestions = (
    <>
      <datalist id={itemListId}>
        {items.map((item) => (
          <option key={item.id} value={item.name}>
            {item.specification ?? item.code}
          </option>
        ))}
      </datalist>
      <datalist id={uomListId}>
        {uoms.map((u) => (
          <option key={u.id} value={u.code}>
            {u.name}
          </option>
        ))}
      </datalist>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="lines" value={payload} />
      {suggestions}

      {/* Desktop: the ruled table the paper form uses. */}
      <div className="hidden overflow-hidden rounded-xl border border-line lg:block">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[58rem] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="text-left">
                <Th className="w-12 text-center">#</Th>
                <Th>Description of item</Th>
                <Th className="w-28">UOM</Th>
                <Th className="w-32">Balance qty</Th>
                <Th className="w-32">Required qty</Th>
                <Th className="w-14">
                  <span className="sr-only">Remove</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="align-top transition-colors hover:bg-sunken">
                  <Td className="tabular pt-4 text-center text-xs text-faint">
                    {i + 1}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-2">
                      <RowInput
                        value={line.customDescription}
                        onChange={(v) => update(i, { customDescription: v })}
                        className={cell}
                        label={`Item name for row ${i + 1}`}
                        error={errorFor(i, 'customDescription')}
                        list={itemListId}
                      />
                      <input
                        value={line.remarks}
                        onChange={(e) => update(i, { remarks: e.target.value })}
                        placeholder="Remarks (optional)"
                        className={cn(cell, 'h-9 text-xs')}
                        aria-label={`Remarks for row ${i + 1}`}
                      />
                    </div>
                  </Td>
                  <Td>
                    <RowInput
                      value={line.uomCode}
                      onChange={(v) => update(i, { uomCode: v })}
                      className={cn(cell, 'uppercase')}
                      label={`Unit for row ${i + 1}`}
                      error={errorFor(i, 'uomCode')}
                      list={uomListId}
                      maxLength={12}
                    />
                  </Td>
                  <Td>
                    <RowInput
                      value={line.balanceQty}
                      onChange={(v) => update(i, { balanceQty: v })}
                      placeholder="—"
                      className={cellNum}
                      label={`Balance quantity for row ${i + 1}`}
                      error={errorFor(i, 'balanceQty')}
                      inputMode="decimal"
                    />
                  </Td>
                  <Td>
                    <RowInput
                      value={line.requiredQty}
                      onChange={(v) => update(i, { requiredQty: v })}
                      className={cn(cellNum, 'font-medium')}
                      label={`Required quantity for row ${i + 1}`}
                      error={errorFor(i, 'requiredQty')}
                      inputMode="decimal"
                    />
                  </Td>
                  <Td className="text-center">
                    <IconButton
                      type="button"
                      tone="danger"
                      label={`Remove row ${i + 1}`}
                      onClick={() => removeLine(i)}
                      className="h-10 w-10"
                    >
                      <Trash2 size={16} aria-hidden />
                    </IconButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: stacked cards. A six-column table on a phone is unusable. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {lines.map((line, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Item {i + 1}</span>
              <IconButton
                type="button"
                tone="danger"
                label={`Remove item ${i + 1}`}
                onClick={() => removeLine(i)}
              >
                <Trash2 size={16} aria-hidden />
              </IconButton>
            </div>

            <div className="flex flex-col gap-3">
              <RowInput
                value={line.customDescription}
                onChange={(v) => update(i, { customDescription: v })}
                className={inputClass}
                label={`Item name for row ${i + 1}`}
                error={errorFor(i, 'customDescription')}
                list={itemListId}
              />

              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">UOM</span>
                  <RowInput
                    value={line.uomCode}
                    onChange={(v) => update(i, { uomCode: v })}
                    className={cn(inputClass, 'px-3 uppercase')}
                    error={errorFor(i, 'uomCode')}
                    list={uomListId}
                    maxLength={12}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">Balance</span>
                  <RowInput
                    value={line.balanceQty}
                    onChange={(v) => update(i, { balanceQty: v })}
                    placeholder="—"
                    className={cn(inputClass, 'tabular px-3 text-right')}
                    error={errorFor(i, 'balanceQty')}
                    inputMode="decimal"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">Required</span>
                  <RowInput
                    value={line.requiredQty}
                    onChange={(v) => update(i, { requiredQty: v })}
                    className={cn(inputClass, 'tabular px-3 text-right font-medium')}
                    error={errorFor(i, 'requiredQty')}
                    inputMode="decimal"
                  />
                </label>
              </div>

              <input
                value={line.remarks}
                onChange={(e) => update(i, { remarks: e.target.value })}
                placeholder="Remarks (optional)"
                className={cn(inputClass, 'h-10 text-sm')}
                aria-label={`Remarks for row ${i + 1}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-raised active:scale-[0.985]"
        >
          <Plus size={16} aria-hidden />
          Add item
        </button>
        <p className="flex max-w-md items-start gap-1.5 text-xs leading-relaxed text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-faint" aria-hidden />
          Balance quantity is what your department believes is in stores — it is
          recorded as your figure, not a system reading.
        </p>
      </div>
    </div>
  );
}

/** A cell input that turns red and says why when the server rejects it. */
function RowInput({
  value,
  onChange,
  className,
  label,
  error,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  className: string;
  label?: string;
  error?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'className'
>) {
  return (
    <span className="flex flex-col gap-1">
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={cn(
          className,
          error && 'border-danger focus:border-danger focus:ring-red-100',
        )}
      />
      {error && (
        <span className="text-[11px] font-medium leading-tight text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-sunken px-3 py-2.5 text-xs font-medium text-muted whitespace-nowrap',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn('border-b border-line px-3 py-3 last:border-0', className)}>
      {children}
    </td>
  );
}
