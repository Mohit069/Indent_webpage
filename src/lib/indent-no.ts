import { createHash } from 'node:crypto';

/*
 * Indent numbering and line hashing.
 *
 * Deliberately not marked `server-only`: these are pure functions, the
 * `node:crypto` import already makes them unusable from a client component, and
 * the guard would otherwise stop the test scripts from exercising the very
 * hashing that the audit trail depends on.
 */

export const INDENT_PREFIX = process.env.INDENT_PREFIX ?? 'MQ/IND';

/**
 * The Indian financial year for a date, as "26-27" for 2026-04-01 → 2027-03-31.
 *
 * April is the boundary, not January, because the indent book is reconciled
 * against the accounting year.
 */
export function financialYear(d: Date): string {
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-based; 3 = April
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

/** `MQ/IND/26-27/0952` — the shape the shop floor already reads off the book. */
export function formatIndentNo(fy: string, value: number): string {
  return `${INDENT_PREFIX}/${fy}/${String(value).padStart(4, '0')}`;
}

/**
 * A digest of the line items as they stand right now.
 *
 * Stored on every approval event. If a quantity is edited afterwards, the lines
 * no longer hash to the recorded value and the tampering is detectable — which
 * is the property a wet signature on carbon paper gives you for free and a
 * database row does not.
 */
export function hashLines(
  lines: Array<{
    lineNo: number;
    itemId: string | null;
    customDescription: string | null;
    uomId: string;
    balanceQty: string | null;
    requiredQty: string;
  }>,
): string {
  const canonical = lines
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((l) =>
      [
        l.lineNo,
        l.itemId ?? '',
        l.customDescription ?? '',
        /*
         * The empty slot is where a per-line `specification` used to sit.
         *
         * That column has been dropped: nothing ever wrote it, and every row
         * held null — which contributed exactly this empty string. Removing
         * the slot as well would shorten the canonical form and change the
         * digest of every indent already signed off, so each would begin
         * claiming its items had been altered afterwards. The gap stays so
         * those hashes keep verifying. It costs one empty string; the
         * alternative is a false tamper warning on real records.
         */
        '',
        l.uomId,
        l.balanceQty ?? '',
        l.requiredQty,
      ].join(''),
    )
    .join('');

  return createHash('sha256').update(canonical).digest('hex');
}
