/*
 * Turning validation errors into a list of what still needs filling in.
 *
 * The per-field messages are already shown next to each control, but on a form
 * this tall the one that failed is often scrolled off the screen — you press
 * the button, nothing appears to happen, and the reason is six inches above the
 * fold. This produces the summary that goes at the top: the *places* to go
 * back to, named the way the form names them.
 *
 * Field paths arrive from Zod joined with dots, so an item row reads
 * `lines.1.requiredQty`.
 */

const FIELD_LABELS: Record<string, string> = {
  indentDate: 'Date',
  departmentName: 'Department',
  requesterName: 'Requester name',
  requesterDesignation: 'Requester designation',
  priority: 'Priority',
  expectedDate: 'Expected date',
  purpose: 'Remarks / purpose',
  lines: 'Items',
};

const LINE_FIELD_LABELS: Record<string, string> = {
  customDescription: 'Description',
  uomCode: 'Unit',
  balanceQty: 'Balance qty',
  requiredQty: 'Required qty',
  remarks: 'Remarks',
};

/** Human label for one error path, e.g. "Item 2 — Required qty". */
export function labelForPath(path: string): string {
  const parts = path.split('.');

  if (parts[0] === 'lines' && parts.length >= 3) {
    const row = Number(parts[1]);
    const field = LINE_FIELD_LABELS[parts[2]] ?? parts[2];
    // A non-numeric index would mean the path shape changed; degrade rather
    // than print "Item NaN".
    return Number.isFinite(row) ? `Item ${row + 1} — ${field}` : `Items — ${field}`;
  }

  return FIELD_LABELS[parts[0]] ?? parts[0];
}

/**
 * Every place that needs attention, in the order the form lays them out,
 * with duplicates removed.
 */
export function describeMissing(
  fieldErrors?: Record<string, string>,
): string[] {
  if (!fieldErrors) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const path of Object.keys(fieldErrors)) {
    const label = labelForPath(path);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }

  return out;
}
