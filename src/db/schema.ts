import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  date,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/*
 * Purchase Indent System — schema.
 *
 * Mirrors the paper form (Marudhar Quartz, serial book at 952).
 *
 * THERE IS NO AUTHENTICATION. This is an internal tool rotating among two or
 * three people who all do every job, so there are no accounts, no passwords, no
 * sessions and no roles — anyone who can reach the page can raise an indent and
 * move it along.
 *
 * What survives from the paper form is attribution: a short list of `people`
 * and a "who is using this" picker, so the HOD and approval boxes on the
 * printed indent still carry a name rather than being blank. That is a label,
 * not a credential — nothing verifies it.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** The workflow states. See workflow.ts for the legal transitions between them. */
export const indentStatusEnum = pgEnum('indent_status', [
  'DRAFT',
  'PENDING_PURCHASE',
  'PENDING_APPROVAL',
  'RETURNED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'CLOSED',
]);

/*
 * How soon the material is needed.
 *
 * Stated as a deadline rather than as a feeling. "Urgent" meant whatever the
 * person typing it wanted it to mean, and everything drifted upwards; a week,
 * two weeks and three weeks are claims Purchase can actually plan against and
 * that the requester can be held to.
 *
 * Stored in descending urgency, which is also the order they are offered in.
 */
export const priorityEnum = pgEnum('priority', [
  'ASAP',
  'LEVEL_1',
  'LEVEL_2',
  'LEVEL_3',
]);

/** What kind of act an event records. */
export const eventStageEnum = pgEnum('event_stage', [
  'CREATE',
  'SUBMIT',
  'PURCHASE_RECEIPT',
  'FINAL_APPROVAL',
  'RETURN',
  'REJECT',
  'CANCEL',
  'CLOSE',
  'AMEND',
]);

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The people who use this.
 *
 * Not user accounts — there is nothing to sign into. This is the list the
 * "acting as" picker offers, so every action can be attributed to a name and
 * the printed form matches the paper one. Two or three rows is the expected
 * size.
 */
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  designation: text('designation').notNull(),
  /** Optional, purely for contact — never used to identify anyone. */
  phone: text('phone'),

  /*
   * The person's email address.
   *
   * Recorded so each designation has a real person behind it, and so this can
   * become the identity a sign-in checks against later. Nothing authenticates
   * against it today — see the note on the role flags below.
   *
   * Unique, but nullable: Postgres allows any number of NULLs under a unique
   * constraint, so people without one do not collide.
   */
  email: text('email').unique(),

  /*
   * Who may decide an indent.
   *
   * Enforced on the server before any write, and used to hide the buttons from
   * people who do not have the flag. But be clear about what that is worth
   * while there is no sign-in: the acting-as name is a cookie the user picks,
   * so anyone can select a person who holds the flag and act as them. These
   * stop the wrong person deciding by accident, and make the audit trail mean
   * something. They do not stop anyone who intends to get round them.
   *
   * They become a real control the moment a login verifies `email`.
   */
  canApprove: boolean('can_approve').notNull().default(false),
  canReject: boolean('can_reject').notNull().default(false),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const uoms = pgTable('uoms', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const itemCategories = pgTable('item_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
});

/**
 * The item master — the single biggest gain over paper, because free-text
 * descriptions produce fifteen spellings of the same bolt and kill any spend
 * analysis.
 *
 * Never mandatory: an indent line may instead carry customDescription, and the
 * recurring ones get promoted into this table from the triage screen. The
 * catalog grows from real usage rather than from a guess.
 */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    specification: text('specification'),
    categoryId: uuid('category_id').references(() => itemCategories.id),
    defaultUomId: uuid('default_uom_id')
      .notNull()
      .references(() => uoms.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('items_name_idx').on(t.name), index('items_category_idx').on(t.categoryId)],
);

// ---------------------------------------------------------------------------
// Indents
// ---------------------------------------------------------------------------

export const indents = pgTable(
  'indents',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Null until submit. Issuing on draft creation would burn a number on every
     * abandoned draft and reproduce the paper book's silent gaps.
     */
    indentNo: text('indent_no').unique(),
    /** Financial year the number belongs to, e.g. "26-27". */
    fy: text('fy'),

    indentDate: date('indent_date').notNull(),

    /** Whoever was selected in the picker when this was created. A label. */
    raisedById: uuid('raised_by_id').references(() => people.id),
    /** Typed on the form, as on paper — the person who needs the material. */
    requesterName: text('requester_name').notNull(),
    requesterDesignation: text('requester_designation').notNull(),
    /** Chosen on the form now that it cannot be derived from an account. */
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),

    purpose: text('purpose'),
    expectedDate: date('expected_date'),

    status: indentStatusEnum('status').notNull().default('DRAFT'),
    /*
     * Defaults to the least urgent level on purpose. A default of "within a
     * week" would have every routine indent silently claiming a deadline
     * nobody chose.
     */
    priority: priorityEnum('priority').notNull().default('LEVEL_3'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('indents_status_idx').on(t.status),
    index('indents_department_idx').on(t.departmentId),
    index('indents_date_idx').on(t.indentDate),
    index('indents_submitted_idx').on(t.submittedAt),
  ],
);

export const indentLines = pgTable(
  'indent_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    indentId: uuid('indent_id')
      .notNull()
      .references(() => indents.id, { onDelete: 'cascade' }),
    /** 1-based position. The paper form's S.No. column. */
    lineNo: integer('line_no').notNull(),

    /** Exactly one of itemId / customDescription is set — enforced by CHECK below. */
    itemId: uuid('item_id').references(() => items.id),
    customDescription: text('custom_description'),

    uomId: uuid('uom_id')
      .notNull()
      .references(() => uoms.id),

    /**
     * The requesting department's stated stock figure, not a system-verified
     * one. Surfaced as "Balance as per department" so nobody downstream
     * mistakes it for a reading.
     */
    balanceQty: numeric('balance_qty', { precision: 14, scale: 3 }),
    requiredQty: numeric('required_qty', { precision: 14, scale: 3 }).notNull(),

    remarks: text('remarks'),
  },
  (t) => [
    uniqueIndex('indent_lines_indent_line_idx').on(t.indentId, t.lineNo),
    index('indent_lines_item_idx').on(t.itemId),
    check(
      'indent_lines_item_or_description',
      sql`(${t.itemId} IS NOT NULL) <> (${t.customDescription} IS NOT NULL)`,
    ),
    check('indent_lines_required_qty_positive', sql`${t.requiredQty} > 0`),
  ],
);

/**
 * The history. Append-only: rows are never updated and never deleted.
 *
 * With no authentication this is a record of what happened and who said they
 * were doing it — useful for tracing an indent's path and for filling the
 * printed signature boxes, but it is not proof of identity.
 *
 * linesHash still earns its place: it is a digest of the line items as they
 * stood at that instant, so a quantity edited after an approval is detectable
 * regardless of who did it.
 */
export const indentEvents = pgTable(
  'indent_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    indentId: uuid('indent_id')
      .notNull()
      .references(() => indents.id, { onDelete: 'cascade' }),

    stage: eventStageEnum('stage').notNull(),
    fromStatus: indentStatusEnum('from_status'),
    toStatus: indentStatusEnum('to_status').notNull(),

    actorId: uuid('actor_id').references(() => people.id),
    /**
     * Snapshots, because a person's designation changes and the record must
     * show what they were at the moment they acted.
     */
    actorNameSnapshot: text('actor_name_snapshot').notNull(),
    actorDesignationSnapshot: text('actor_designation_snapshot').notNull(),

    note: text('note'),
    linesHash: text('lines_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('indent_events_indent_idx').on(t.indentId),
    index('indent_events_created_idx').on(t.createdAt),
  ],
);

/**
 * Serial number issuance, one row per financial year.
 *
 * Incremented inside the submit transaction with SELECT ... FOR UPDATE, so two
 * people submitting in the same second cannot collide on a number.
 */
export const counters = pgTable(
  'counters',
  {
    fy: text('fy').notNull(),
    prefix: text('prefix').notNull(),
    lastValue: integer('last_value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.fy, t.prefix] })],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const departmentsRelations = relations(departments, ({ many }) => ({
  indents: many(indents),
}));

export const peopleRelations = relations(people, ({ many }) => ({
  indentsRaised: many(indents),
  events: many(indentEvents),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  category: one(itemCategories, {
    fields: [items.categoryId],
    references: [itemCategories.id],
  }),
  defaultUom: one(uoms, { fields: [items.defaultUomId], references: [uoms.id] }),
  lines: many(indentLines),
}));

export const indentsRelations = relations(indents, ({ one, many }) => ({
  raisedBy: one(people, { fields: [indents.raisedById], references: [people.id] }),
  department: one(departments, {
    fields: [indents.departmentId],
    references: [departments.id],
  }),
  lines: many(indentLines),
  events: many(indentEvents),
}));

export const indentLinesRelations = relations(indentLines, ({ one }) => ({
  indent: one(indents, { fields: [indentLines.indentId], references: [indents.id] }),
  item: one(items, { fields: [indentLines.itemId], references: [items.id] }),
  uom: one(uoms, { fields: [indentLines.uomId], references: [uoms.id] }),
}));

export const indentEventsRelations = relations(indentEvents, ({ one }) => ({
  indent: one(indents, { fields: [indentEvents.indentId], references: [indents.id] }),
  actor: one(people, { fields: [indentEvents.actorId], references: [people.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Person = typeof people.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Uom = typeof uoms.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemCategory = typeof itemCategories.$inferSelect;
export type Indent = typeof indents.$inferSelect;
export type IndentLine = typeof indentLines.$inferSelect;
export type IndentEvent = typeof indentEvents.$inferSelect;

export type IndentStatus = (typeof indentStatusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type EventStage = (typeof eventStageEnum.enumValues)[number];
