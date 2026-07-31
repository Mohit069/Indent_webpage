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
 * Identity is real: `people` are accounts with a password and a role, and
 * `sessions` is what a signed-in browser holds. This replaced an earlier design
 * with no sign-in at all, where the acting-as name was a cookie the user picked.
 * That was honest for two or three people who all did every job; it stopped
 * being honest the moment the requirement became ten departments where only one
 * named person may approve. A permission that anyone can grant themselves by
 * editing a cookie is documentation, not a control.
 *
 * What survives from the paper form is attribution: every event snapshots the
 * actor's name and designation, so the printed indent's signature boxes carry a
 * name rather than being blank — and now that name has been authenticated.
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

/*
 * What a person is, which decides what they may do.
 *
 * Three roles, because the business has three jobs. Permissions are derived
 * from this in rbac.ts rather than stored per-person, so adding a fourth role
 * is one entry in one table instead of a migration over every account.
 *
 * SUPER_ADMIN is not hardcoded to one email. Saurabh is seeded as the first
 * one, but the role is a value like any other and a second can be appointed
 * from the Users screen without touching code.
 */
export const userRoleEnum = pgEnum('user_role', [
  'SUPER_ADMIN',
  'HOD',
  'PURCHASE',
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
 * The people who use this — user accounts.
 *
 * Never deleted, only deactivated: a person's name is on the history of every
 * indent they touched, and a foreign key from `indent_events` has to keep
 * resolving. `isActive: false` is what "removed" means here, and it blocks
 * sign-in immediately.
 */
export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    designation: text('designation').notNull(),
    /** Optional, purely for contact. */
    phone: text('phone'),

    /*
     * The login identity.
     *
     * Unique but nullable, and the two facts are related: Postgres allows any
     * number of NULLs under a unique constraint, which is what lets the three
     * placeholder people who predate accounts stay in the table as historical
     * actors. No email means no way to sign in, which is exactly right for
     * them — they are names on old events, not users.
     *
     * Stored lower-cased; see `normaliseEmail` in auth.ts. Sign-in would
     * otherwise fail for anyone whose phone capitalised the first letter.
     */
    email: text('email').unique(),

    /*
     * scrypt, salted per person. Null means the account cannot be signed into
     * yet — either it was just created and is waiting for its first password,
     * or an admin reset it. Never a plaintext or reversible value.
     */
    passwordHash: text('password_hash'),

    /** Set when an admin resets a password, cleared when the user picks a new
     *  one. The login flow forces the change before anything else is reachable. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),

    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    role: userRoleEnum('role').notNull().default('HOD'),

    /*
     * The department this person heads, for an HOD.
     *
     * Nullable because a Super Admin belongs to all of them and the Purchase
     * team belongs to none. It is what scopes an HOD's list to their own
     * indents rather than the whole company's.
     */
    departmentId: uuid('department_id').references(() => departments.id),

    /*
     * Extra grants on top of the role.
     *
     * The role decides the baseline — only SUPER_ADMIN approves — and these
     * two allow one person to be handed approval rights without making them a
     * full Super Admin. They are additive only: rbac.ts unions them with the
     * role's permissions and never subtracts, so clearing a flag can't strip a
     * Super Admin of a power their role grants.
     */
    canApprove: boolean('can_approve').notNull().default(false),
    canReject: boolean('can_reject').notNull().default(false),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('people_department_idx').on(t.departmentId), index('people_role_idx').on(t.role)],
);

/**
 * A signed-in browser.
 *
 * Server-side rather than a self-contained token, so that disabling an account
 * or resetting a password can end its sessions immediately. A JWT cannot be
 * withdrawn before it expires; a row can be deleted.
 *
 * `tokenHash` and not the token: the cookie holds a random 32-byte secret, and
 * only its SHA-256 is stored. Anyone who reads this table — a backup, a log, a
 * support query — still cannot sign in as anybody.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_person_idx').on(t.personId), index('sessions_expires_idx').on(t.expiresAt)],
);

/**
 * Everything anybody did, across the whole application.
 *
 * Distinct from `indent_events`, which is the workflow history of one indent
 * and drives the printed signature boxes. This is the wider record: sign-ins,
 * user creation, role changes, department edits. An indent transition writes to
 * both, because the two answer different questions — "what happened to this
 * indent" and "what did this person do".
 *
 * Append-only. Nothing in the application updates or deletes a row here.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => people.id),
    /** Snapshot, so the log still reads correctly after a rename. */
    actorNameSnapshot: text('actor_name_snapshot').notNull(),

    /** Machine-readable, dotted: `indent.approve`, `user.create`, `auth.login`. */
    action: text('action').notNull(),
    /** What kind of thing was acted on: `indent`, `person`, `department`, `auth`. */
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),

    /** One line, already written for a human to read in the log table. */
    summary: text('summary').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_log_created_idx').on(t.createdAt),
    index('activity_log_actor_idx').on(t.actorId),
    index('activity_log_entity_idx').on(t.entityType, t.entityId),
  ],
);

// `notifications` is defined below the indents table — it carries a foreign key
// to it, and declaring it here would depend on that reference being resolved
// lazily rather than on the order the module evaluates in.

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
 * In-app notifications.
 *
 * Deliberately not email: the requirement is a badge on the sidebar showing how
 * many indents are waiting, and a note to the requester when theirs is decided.
 * Both are reads against this table. Sending mail is a separate concern with
 * separate failure modes, and nothing here depends on it.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),

    /** `indent.submitted`, `indent.approved`, `indent.rejected`. */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),

    indentId: uuid('indent_id').references(() => indents.id, { onDelete: 'cascade' }),

    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_person_unread_idx').on(t.personId, t.readAt),
    index('notifications_created_idx').on(t.createdAt),
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

export const peopleRelations = relations(people, ({ one, many }) => ({
  indentsRaised: many(indents),
  events: many(indentEvents),
  sessions: many(sessions),
  notifications: many(notifications),
  department: one(departments, {
    fields: [people.departmentId],
    references: [departments.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  person: one(people, { fields: [sessions.personId], references: [people.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  actor: one(people, { fields: [activityLog.actorId], references: [people.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  person: one(people, { fields: [notifications.personId], references: [people.id] }),
  indent: one(indents, { fields: [notifications.indentId], references: [indents.id] }),
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
export type Session = typeof sessions.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Uom = typeof uoms.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemCategory = typeof itemCategories.$inferSelect;
export type Indent = typeof indents.$inferSelect;
export type IndentLine = typeof indentLines.$inferSelect;
export type IndentEvent = typeof indentEvents.$inferSelect;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type IndentStatus = (typeof indentStatusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type EventStage = (typeof eventStageEnum.enumValues)[number];
