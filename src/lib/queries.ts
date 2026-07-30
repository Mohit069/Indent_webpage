import 'server-only';
import { and, desc, eq, inArray, or, ilike, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  departments,
  indentEvents,
  indentLines,
  indents,
  itemCategories,
  items,
  people,
  uoms,
} from '@/db/schema';
import type { IndentStatus, Priority } from '@/db/schema';

/*
 * Reads.
 *
 * Kept out of the actions file because server components call these directly —
 * a read does not need to be a server action, and marking it as one would ship
 * a needless endpoint.
 *
 * Nothing here is scoped by user, because there are no users. Everyone who can
 * reach the app sees every indent, drafts included.
 */

export interface IndentListRow {
  id: string;
  indentNo: string | null;
  indentDate: string;
  status: IndentStatus;
  priority: Priority;
  requesterName: string;
  requesterDesignation: string;
  departmentName: string;
  raisedByName: string | null;
  lineCount: number;
  submittedAt: Date | null;
  updatedAt: Date;
  expectedDate: string | null;
}

function baseIndentSelect() {
  return db
    .select({
      id: indents.id,
      indentNo: indents.indentNo,
      indentDate: indents.indentDate,
      status: indents.status,
      priority: indents.priority,
      requesterName: indents.requesterName,
      requesterDesignation: indents.requesterDesignation,
      departmentName: departments.name,
      raisedByName: people.name,
      submittedAt: indents.submittedAt,
      updatedAt: indents.updatedAt,
      expectedDate: indents.expectedDate,
      lineCount: sql<number>`(
        select count(*)::int from ${indentLines} where ${indentLines.indentId} = ${indents.id}
      )`,
    })
    .from(indents)
    .innerJoin(departments, eq(indents.departmentId, departments.id))
    .leftJoin(people, eq(indents.raisedById, people.id));
}

export async function listIndents(
  opts: {
    statuses?: IndentStatus[];
    departmentId?: string;
    search?: string;
    limit?: number;
  } = {},
): Promise<IndentListRow[]> {
  const clauses = [];

  if (opts.statuses?.length) clauses.push(inArray(indents.status, opts.statuses));
  if (opts.departmentId) clauses.push(eq(indents.departmentId, opts.departmentId));

  if (opts.search?.trim()) {
    const term = `%${opts.search.trim()}%`;
    clauses.push(
      or(
        ilike(indents.indentNo, term),
        ilike(indents.requesterName, term),
        ilike(indents.purpose, term),
        ilike(departments.name, term),
      ),
    );
  }

  const q = baseIndentSelect();
  return (clauses.length ? q.where(and(...clauses)) : q)
    .orderBy(desc(indents.updatedAt))
    .limit(opts.limit ?? 200);
}

export async function getIndent(id: string) {
  const [indent] = await db.select().from(indents).where(eq(indents.id, id)).limit(1);
  if (!indent) return null;

  const [department] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, indent.departmentId))
    .limit(1);

  const raisedBy = indent.raisedById
    ? (await db.select().from(people).where(eq(people.id, indent.raisedById)).limit(1))[0]
    : null;

  const lines = await db
    .select({
      id: indentLines.id,
      lineNo: indentLines.lineNo,
      itemId: indentLines.itemId,
      customDescription: indentLines.customDescription,
      specification: indentLines.specification,
      uomId: indentLines.uomId,
      uomCode: uoms.code,
      balanceQty: indentLines.balanceQty,
      requiredQty: indentLines.requiredQty,
      expectedDate: indentLines.expectedDate,
      remarks: indentLines.remarks,
      itemName: items.name,
      itemCode: items.code,
      itemSpecification: items.specification,
    })
    .from(indentLines)
    .innerJoin(uoms, eq(indentLines.uomId, uoms.id))
    .leftJoin(items, eq(indentLines.itemId, items.id))
    .where(eq(indentLines.indentId, id))
    .orderBy(indentLines.lineNo);

  const events = await db
    .select()
    .from(indentEvents)
    .where(eq(indentEvents.indentId, id))
    .orderBy(indentEvents.createdAt);

  return { indent, department, raisedBy, lines, events };
}

export type IndentDetail = NonNullable<Awaited<ReturnType<typeof getIndent>>>;
export type IndentDetailLine = IndentDetail['lines'][number];

/** Counts per status, for the tiles at the top of the dashboard. */
export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: indents.status, count: sql<number>`count(*)::int` })
    .from(indents)
    .groupBy(indents.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

/** Volume per department, for the dashboard bar chart. */
export async function departmentCounts(): Promise<{ name: string; count: number }[]> {
  const rows = await db
    .select({ name: departments.name, count: sql<number>`count(${indents.id})::int` })
    .from(departments)
    .leftJoin(indents, eq(indents.departmentId, departments.id))
    .groupBy(departments.name)
    .orderBy(desc(sql`count(${indents.id})`));
  return rows;
}

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

export async function listUoms() {
  return db.select().from(uoms).where(eq(uoms.isActive, true)).orderBy(uoms.code);
}

export async function listItems() {
  return db
    .select({
      id: items.id,
      code: items.code,
      name: items.name,
      specification: items.specification,
      defaultUomId: items.defaultUomId,
      categoryName: itemCategories.name,
    })
    .from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .where(eq(items.isActive, true))
    .orderBy(items.name);
}

export async function listDepartments() {
  return db
    .select()
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(departments.name);
}

export async function listAllPeople() {
  return db.select().from(people).orderBy(people.name);
}

export async function listItemCategories() {
  return db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.isActive, true))
    .orderBy(itemCategories.name);
}

/** Names typed on previous indents, offered as autocomplete so the same fitter
 *  does not end up spelled four different ways. */
export async function requesterSuggestions(): Promise<string[]> {
  const rows = await db.selectDistinct({ name: indents.requesterName }).from(indents).limit(200);
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
}

/**
 * Free-text descriptions people have typed, ranked by how often they recur.
 *
 * The item-triage screen was removed, but this is still worth having: the
 * item-master page shows the recurring ones so the catalog can grow from real
 * usage rather than from a guess.
 */
export async function commonTypedDescriptions(limit = 8) {
  return db
    .select({
      description: indentLines.customDescription,
      uses: sql<number>`count(*)::int`,
    })
    .from(indentLines)
    .where(sql`${indentLines.customDescription} is not null`)
    .groupBy(indentLines.customDescription)
    .having(sql`count(*) >= 2`)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}
