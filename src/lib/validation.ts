import { z } from 'zod';

/*
 * The one place a rule about shape is written.
 *
 * Each schema validates the browser form and the server action, and generates
 * the TypeScript type. Validation and types cannot drift apart, and a rule
 * cannot be enforced on the client but forgotten on the server.
 */

const uuid = z.string().uuid('Not a valid selection');

/** Quantities arrive from form inputs as strings and stay strings all the way
 *  to Postgres `numeric` — parsing them through a float would quietly round. */
const quantity = z
  .string()
  .trim()
  .min(1, 'Enter a quantity')
  .regex(/^\d{1,10}(\.\d{1,3})?$/, 'Use a number, up to 3 decimal places')
  .refine((v) => Number(v) > 0, 'Must be greater than zero');

const optionalQuantity = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,3})?$/, 'Use a number, up to 3 decimal places')
  .optional()
  .or(z.literal('').transform(() => undefined));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

const todayIso = () => new Date().toISOString().slice(0, 10);

/** A cleared — or absent — date box means today, not an error. */
const dateOrToday = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : todayIso()))
  .pipe(isoDate);

/**
 * The unit an item is counted in.
 *
 * Blank is allowed and means Nos, which is what most of what this plant
 * indents is counted in. Requiring it made people stop and fill a box whose
 * answer was the same on nearly every row.
 */
const DEFAULT_UOM = 'NOS';

const uomCode = z
  .string()
  .trim()
  .max(12, 'Keep it short — NOS, KG, MTR')
  .transform((v) => v.toUpperCase())
  .refine(
    (v) => v === '' || /^[A-Za-z0-9./-]+$/.test(v),
    'Letters, digits, . / and - only',
  )
  .transform((v) => (v === '' ? DEFAULT_UOM : v));

// ---------------------------------------------------------------------------
// Indents
// ---------------------------------------------------------------------------

/**
 * One line of the indent table.
 *
 * A line names either a catalog item or a free-text description — never both,
 * never neither. The catalog is not mandatory on day one because forcing it
 * would push people back to paper; Purchase promotes recurring free-text lines
 * into the master afterwards.
 */
export const indentLineSchema = z
  .object({
    itemId: uuid.optional().or(z.literal('').transform(() => undefined)),
    customDescription: z
      .string()
      .trim()
      .max(500, 'Keep it under 500 characters')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    specification: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /*
     * The unit is typed, not chosen.
     *
     * A dropdown meant that anything not already in the master could not be
     * indented at all, which sent people back to the paper book for exactly the
     * odd items the catalog was worst at. The server resolves what is typed
     * against the uoms table and adds it if it is new, so the master still ends
     * up complete — it just grows from real use rather than being guessed at up
     * front. Upper-cased so "kg" and "KG" cannot become two rows.
     */
    uomCode,
    balanceQty: optionalQuantity,
    requiredQty: quantity,
    expectedDate: isoDate.optional().or(z.literal('').transform(() => undefined)),
    remarks: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .refine((l) => Boolean(l.itemId) !== Boolean(l.customDescription), {
    message: 'Pick an item from the list, or type a description — not both',
    path: ['customDescription'],
  });

/*
 * What an indent cannot do without.
 *
 * Only four things are mandatory: the department it belongs to, who asked for
 * it, and — per row — what the item is and how much of it. Everything else is
 * optional, because a form that stops you over a field nobody reads is a form
 * people work around.
 */
export const indentSchema = z.object({
  indentDate: dateOrToday,
  /** Chosen on the form — with no accounts, it cannot be derived from anyone. */
  departmentId: z.string().uuid('Choose a department'),
  requesterName: z
    .string()
    .trim()
    .min(2, 'Enter the requester’s name')
    .max(120, 'That is too long'),
  /** Optional. Prints as a blank line in the signature box when not given. */
  requesterDesignation: z
    .string()
    .trim()
    .max(120, 'That is too long')
    .optional(),
  purpose: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  expectedDate: isoDate.optional().or(z.literal('').transform(() => undefined)),
  priority: z.enum(['ASAP', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']),
  lines: z
    .array(indentLineSchema)
    .min(1, 'An indent needs at least one item')
    .max(50, 'Split this across more than one indent'),
});

/**
 * FormData → the object `indentSchema` expects.
 *
 * The reason this exists rather than being written inline at the call site:
 * `formData.get()` answers `null` for a field the form did not render, and a
 * Zod `.optional()` accepts `undefined` but rejects `null`. So deleting a box
 * from the form silently turned it into a *required* field — the server kept
 * reading it, got null, and reported the field as invalid under its own name.
 * That is exactly how "deptRef" came to be demanded by a form that no longer
 * had a department-reference box on it.
 *
 * Normalising null to undefined here means removing a field from the UI can
 * never again resurrect it as a validation error.
 */
export function indentInputFromForm(formData: FormData, lines: unknown) {
  const field = (name: string): string | undefined => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : undefined;
  };

  return {
    indentDate: field('indentDate'),
    departmentId: field('departmentId'),
    requesterName: field('requesterName'),
    requesterDesignation: field('requesterDesignation'),
    purpose: field('purpose'),
    expectedDate: field('expectedDate'),
    priority: field('priority') ?? 'LEVEL_3',
    lines,
  };
}

export const transitionSchema = z.object({
  indentId: uuid,
  action: z.enum(['submit', 'approve', 'reject']),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Required for approve and reject. Checked server-side, never in the browser. */
  password: z
    .string()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /**
   * Where to go once it worked, so the confirmation lands on the page you were
   * already on.
   *
   * It arrives from the browser, so it is constrained to a same-site path here:
   * a bare "/" prefix, and never "//" or "/\" which browsers read as a host and
   * would turn this into an open redirect.
   */
  returnTo: z
    .string()
    .max(300)
    .regex(/^\/(?![/\\])[A-Za-z0-9\-._~/]*$/, 'Invalid return path')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

/** A person in the "acting as" picker. Not an account — there is nothing to
 *  sign into, so there is no password and no role. */
export const personSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  designation: z.string().trim().min(2, 'Enter a designation').max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s]*$/, 'Digits only')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Enter a department name').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Enter a short code')
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and hyphens only')
    .transform((v) => v.toUpperCase()),
});

export const uomSchema = z.object({
  code: z.string().trim().min(1, 'Enter a code').max(12),
  name: z.string().trim().min(1, 'Enter a name').max(60),
});

export const itemSchema = z.object({
  code: z.string().trim().min(1, 'Enter an item code').max(40),
  name: z.string().trim().min(2, 'Enter an item name').max(200),
  specification: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  categoryId: uuid.optional().or(z.literal('').transform(() => undefined)),
  defaultUomId: uuid,
});

export type IndentInput = z.infer<typeof indentSchema>;
export type IndentLineInput = z.infer<typeof indentLineSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type PersonInput = z.infer<typeof personSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
