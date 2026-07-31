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
 * Every field here has a box on the form. Three that used to live here do not,
 * and were removed because nothing could ever fill them:
 *
 *   itemId        — set by the catalog dropdown, which is gone. The column is
 *                   kept for the rows that already reference an item.
 *   specification — never had an input of its own; the item name box carries
 *                   the specification, as its old placeholder said.
 *   expectedDate  — per-line date. There is one date on the indent as a whole
 *                   and never was one per row.
 *
 * They cost nothing to leave in and were still a real hazard: a schema field
 * that no form can fill is exactly how a phantom required field appears.
 */
export const indentLineSchema = z.object({
  /*
   * The item, as typed. Required — a row without one is not an item.
   *
   * This was an exclusive-or against a catalog id, with the message "pick an
   * item from the list, or type a description". Once the list was removed the
   * rule still worked but the message told people to use a control that was no
   * longer on the page.
   */
  customDescription: z
    .string()
    .trim()
    .min(1, 'Enter the item')
    .max(500, 'Keep it under 500 characters'),
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
  remarks: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
  /*
   * Typed, not chosen — and still mandatory.
   *
   * The server matches what is typed against the departments master, ignoring
   * case, and adds it if it is genuinely new. So the column still holds a real
   * foreign key and reporting by department still works; the list just stops
   * being a gate on raising an indent at all.
   */
  departmentName: z
    .string()
    .trim()
    .min(2, 'Enter a department')
    .max(120, 'That is too long'),
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
 * Read one field out of a FormData, as Zod wants it.
 *
 * THE ONLY WAY THIS CODEBASE READS A FORM FIELD. Never call `formData.get()`
 * directly at a call site — read on.
 *
 * `formData.get()` answers `null` for a field the form did not render, and a
 * Zod `.optional()` accepts `undefined` but rejects `null`. So an optional
 * field that is simply absent from the markup does not come through as
 * "missing"; it comes through as *invalid*, and the schema reports an error
 * against a box that is not on the screen.
 *
 * That failure is close to invisible, because forms only render errors for the
 * fields they know about. It has now caused two separate bugs:
 *
 *   deptRef   — a removed field kept being demanded by a form that no longer
 *               had it, and named itself in the error.
 *   returnTo  — sign-in did nothing at all. The action ran, the schema refused
 *               a null `returnTo`, and the login form had no place to show an
 *               error about a hidden field, so the page just sat there.
 *
 * The same shape almost certainly explains why Reject never appeared to work:
 * its form has no password box, so `password` arrived as null and was rejected
 * before anything happened.
 */
export function formValue(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  // A File is not a string; treat it as absent rather than passing it to Zod.
  return typeof value === 'string' ? value : undefined;
}

/** A checkbox: absent when unticked, "on" when ticked. */
export function formFlag(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

/** Several fields at once, keyed by name. Saves a dozen repetitive lines in
 *  actions that read a whole form. */
export function formValues<K extends string>(
  formData: FormData,
  names: readonly K[],
): Record<K, string | undefined> {
  const out = {} as Record<K, string | undefined>;
  for (const name of names) out[name] = formValue(formData, name);
  return out;
}

/** FormData → the object `indentSchema` expects. */
export function indentInputFromForm(formData: FormData, lines: unknown) {
  return {
    ...formValues(formData, [
      'indentDate',
      'departmentName',
      'requesterName',
      'requesterDesignation',
      'purpose',
      'expectedDate',
    ]),
    priority: formValue(formData, 'priority') ?? 'LEVEL_3',
    lines,
  };
}

/*
 * No `note` field.
 *
 * Rejection used to demand a written reason. It no longer does, and nothing
 * else ever set one, so the form has nothing to send. The column on
 * indent_events is kept — the rejections recorded before this still carry
 * their reason, and the history has to keep resolving.
 */
export const transitionSchema = z.object({
  indentId: uuid,
  action: z.enum(['submit', 'approve', 'reject']),
  /** Required for approve. Checked server-side, never in the browser. */
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
// Accounts and sign-in
// ---------------------------------------------------------------------------

const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .email('That does not look like an email address')
  .max(200);

/**
 * A new password.
 *
 * Twelve characters and nothing else — no required symbol, no forced digit.
 * Composition rules push people towards Passw0rd! and towards writing it on the
 * monitor; length is what actually costs an attacker anything. The only other
 * rule is that it not be one of the handful of passwords everybody tries first.
 */
const BANNED_PASSWORDS = new Set([
  'password', 'password123', '123456789012', 'qwertyuiop12',
  'artizia12345', 'administrator', 'letmein12345',
]);

const newPassword = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'That is too long')
  .refine(
    (v) => !BANNED_PASSWORDS.has(v.toLowerCase()),
    'That password is too easy to guess — choose another',
  );

export const loginSchema = z.object({
  email: emailAddress,
  /*
   * Only that something was typed. The stored password predates whatever rule
   * is current, and refusing to *check* a short one would lock out an account
   * whose password was set under an older policy.
   */
  password: z.string().min(1, 'Enter your password').max(200),
  returnTo: z
    .string()
    .max(300)
    .regex(/^\/(?![/\\])[A-Za-z0-9\-._~/]*$/, 'Invalid return path')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

/** An admin setting someone else's password. No current password — the admin
 *  does not know it, which is the entire reason they are resetting it. */
export const resetPasswordSchema = z
  .object({
    personId: uuid,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

/**
 * A user account.
 *
 * Was a name for the "acting as" picker with no password and no role. It is now
 * a login: email identifies the account, role decides what it may do.
 */
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
  /*
   * Lower-cased, because addresses are compared case-insensitively in practice
   * and the column is unique — Suresh@ and suresh@ must not become two people.
   *
   * Required now: it is the login identity, and an account with no address is
   * one nobody can ever sign into.
   */
  email: emailAddress,
  role: z.enum(['SUPER_ADMIN', 'HOD', 'PURCHASE']),
  /** An HOD's own department. Absent for Super Admin and Purchase, who are not
   *  scoped to one. */
  departmentId: uuid.optional().or(z.literal('').transform(() => undefined)),
  /** Optional at creation: leaving it blank creates the account without a
   *  password, and it cannot be signed into until one is set. */
  password: newPassword.optional().or(z.literal('').transform(() => undefined)),
  /** Checkboxes arrive as "on" when ticked and are absent when not. */
  canApprove: z.coerce.boolean().default(false),
  canReject: z.coerce.boolean().default(false),
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

/*
 * No inferred-type exports.
 *
 * There were five — IndentInput, IndentLineInput, TransitionInput, PersonInput,
 * ItemInput — and not one had an importer anywhere in src/ or scripts/. Every
 * caller already derives what it needs from the schema at the point of use,
 * which is what stops the two drifting apart; a second name for the same shape
 * is one more thing that has to be kept true.
 *
 * Add one back the moment something actually imports it.
 */
