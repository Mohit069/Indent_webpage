import 'server-only';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  activityLog,
  departments,
  indentLines,
  indents,
  people,
} from '@/db/schema';
import type { IndentStatus, Priority, UserRole } from '@/db/schema';

/*
 * Reads for the admin area.
 *
 * Kept apart from queries.ts, which serves the requester's screens. The two
 * have different shapes: those answer "what are my indents", these answer
 * "what is the state of everything", and mixing them produced a file where it
 * was not obvious which functions were safe to call unscoped.
 *
 * Nothing here scopes by person. Every caller is behind a permission that
 * already means "sees everything" — see guard.ts — and a query that silently
 * filtered would make the dashboard's numbers quietly wrong.
 */

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Midnight this morning, in the server's zone. "Approved today" means the
 *  working day people are actually having, not the last 24 hours. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface DashboardStats {
  pendingApproval: number;
  approvedToday: number;
  rejectedToday: number;
  totalDrafts: number;
  criticalPending: number;
  /** Mean hours from submit to approval, or null when nothing has been
   *  approved yet — which is different from "zero hours". */
  avgApprovalHours: number | null;
}

export async function dashboardStats(): Promise<DashboardStats> {
  const today = startOfToday();

  const [statusRows, todayRows, avgRow] = await Promise.all([
    db
      .select({ status: indents.status, n: count() })
      .from(indents)
      .groupBy(indents.status),

    /*
     * Today's decisions, read from the event log rather than from
     * indents.approvedAt. An indent carries only its latest state, so counting
     * rejections off the indents table would miss one that was rejected this
     * morning and re-raised this afternoon.
     */
    db
      .select({ stage: sql<string>`stage`, n: count() })
      .from(sql`indent_events`)
      .where(sql`created_at >= ${today} and stage in ('FINAL_APPROVAL', 'REJECT')`)
      .groupBy(sql`stage`),

    db
      .select({
        hours: sql<string | null>`
          avg(extract(epoch from (${indents.approvedAt} - ${indents.submittedAt})) / 3600)`,
      })
      .from(indents)
      .where(and(isNotNull(indents.approvedAt), isNotNull(indents.submittedAt))),
  ]);

  const byStatus = new Map(statusRows.map((r) => [r.status, r.n]));
  const byStage = new Map(todayRows.map((r) => [r.stage, r.n]));

  const [critical] = await db
    .select({ n: count() })
    .from(indents)
    .where(and(eq(indents.status, 'PENDING_APPROVAL'), eq(indents.priority, 'ASAP')));

  const avg = avgRow[0]?.hours;

  return {
    pendingApproval: byStatus.get('PENDING_APPROVAL') ?? 0,
    approvedToday: byStage.get('FINAL_APPROVAL') ?? 0,
    rejectedToday: byStage.get('REJECT') ?? 0,
    totalDrafts: byStatus.get('DRAFT') ?? 0,
    criticalPending: critical?.n ?? 0,
    avgApprovalHours: avg === null || avg === undefined ? null : Number(avg),
  };
}

// ---------------------------------------------------------------------------
// Indent lists
// ---------------------------------------------------------------------------

export interface AdminIndentRow {
  id: string;
  indentNo: string | null;
  indentDate: string;
  status: IndentStatus;
  priority: Priority;
  requesterName: string;
  requesterDesignation: string;
  departmentName: string;
  lineCount: number;
  submittedAt: Date | null;
  updatedAt: Date;
}

export interface IndentFilters {
  statuses?: IndentStatus[];
  departmentId?: string;
  priority?: Priority;
  search?: string;
  from?: string;
  to?: string;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Turn the filter object into SQL.
 *
 * Extracted because the list and its count must apply *exactly* the same
 * conditions. Two hand-written copies is how a table ends up showing four rows
 * above the words "23 results".
 */
function indentWhere(f: IndentFilters) {
  const clauses = [];

  if (f.statuses?.length) clauses.push(inArray(indents.status, f.statuses));
  if (f.departmentId) clauses.push(eq(indents.departmentId, f.departmentId));
  if (f.priority) clauses.push(eq(indents.priority, f.priority));
  if (f.from) clauses.push(gte(indents.indentDate, f.from));
  if (f.to) clauses.push(lte(indents.indentDate, f.to));

  if (f.search?.trim()) {
    const term = `%${f.search.trim()}%`;
    clauses.push(
      or(
        ilike(indents.indentNo, term),
        ilike(indents.requesterName, term),
        ilike(indents.purpose, term),
        ilike(departments.name, term),
      ),
    );
  }

  return clauses.length ? and(...clauses) : undefined;
}

export async function listIndentsPaged(
  filters: IndentFilters,
  page = 1,
  pageSize = 20,
): Promise<Page<AdminIndentRow>> {
  const where = indentWhere(filters);
  const safePage = Math.max(1, Math.floor(page));

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: indents.id,
        indentNo: indents.indentNo,
        indentDate: indents.indentDate,
        status: indents.status,
        priority: indents.priority,
        requesterName: indents.requesterName,
        requesterDesignation: indents.requesterDesignation,
        departmentName: departments.name,
        submittedAt: indents.submittedAt,
        updatedAt: indents.updatedAt,
        lineCount: sql<number>`(
          select count(*)::int from ${indentLines} where ${indentLines.indentId} = ${indents.id}
        )`,
      })
      .from(indents)
      .innerJoin(departments, eq(indents.departmentId, departments.id))
      .where(where)
      /*
       * Most urgent first, then longest waiting. The priority enum is declared
       * in descending urgency, so its natural order is already the right one —
       * ASAP, then LEVEL_1, and so on.
       */
      .orderBy(asc(indents.priority), asc(indents.submittedAt), desc(indents.updatedAt))
      .limit(pageSize)
      .offset((safePage - 1) * pageSize),

    db
      .select({ n: count() })
      .from(indents)
      .innerJoin(departments, eq(indents.departmentId, departments.id))
      .where(where),
  ]);

  const total = totalRow[0]?.n ?? 0;

  return {
    rows,
    total,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export async function listActivityPaged(
  page = 1,
  pageSize = 50,
  filters: { actorId?: string; entityType?: string } = {},
): Promise<Page<typeof activityLog.$inferSelect>> {
  const clauses = [];
  if (filters.actorId) clauses.push(eq(activityLog.actorId, filters.actorId));
  if (filters.entityType) clauses.push(eq(activityLog.entityType, filters.entityType));
  const where = clauses.length ? and(...clauses) : undefined;

  const safePage = Math.max(1, Math.floor(page));

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(activityLog)
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(pageSize)
      .offset((safePage - 1) * pageSize),

    db.select({ n: count() }).from(activityLog).where(where),
  ]);

  const total = totalRow[0]?.n ?? 0;

  return {
    rows,
    total,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** The last few entries, for the dashboard's Recent Activity card. */
export async function recentActivity(limit = 8) {
  return db
    .select()
    .from(activityLog)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Users and departments
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  designation: string;
  role: UserRole;
  departmentName: string | null;
  isActive: boolean;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  canApprove: boolean;
  canReject: boolean;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      email: people.email,
      designation: people.designation,
      role: people.role,
      departmentName: departments.name,
      isActive: people.isActive,
      passwordHash: people.passwordHash,
      mustChangePassword: people.mustChangePassword,
      lastLoginAt: people.lastLoginAt,
      canApprove: people.canApprove,
      canReject: people.canReject,
    })
    .from(people)
    .leftJoin(departments, eq(people.departmentId, departments.id))
    .orderBy(asc(people.name));

  // The hash never leaves this function — only whether there is one. A password
  // hash has no business being passed to a component that renders a table.
  return rows.map(({ passwordHash, ...r }) => ({
    ...r,
    hasPassword: passwordHash !== null,
  }));
}

export interface AdminDepartmentRow {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  headName: string | null;
  userCount: number;
  pendingCount: number;
  totalCount: number;
}

export async function listDepartmentsWithStats(): Promise<AdminDepartmentRow[]> {
  /*
   * One query with correlated sub-selects rather than three joins.
   *
   * Joining people and indents to the same department row multiplies them
   * together — a department with 3 users and 5 indents would report 15 of each.
   * Sub-selects keep each count independent.
   */
  return db
    .select({
      id: departments.id,
      name: departments.name,
      code: departments.code,
      isActive: departments.isActive,
      headName: sql<string | null>`(
        select p.name from ${people} p
        where p.department_id = ${departments.id} and p.role = 'HOD' and p.is_active
        order by p.name limit 1
      )`,
      userCount: sql<number>`(
        select count(*)::int from ${people} p where p.department_id = ${departments.id}
      )`,
      pendingCount: sql<number>`(
        select count(*)::int from ${indents} i
        where i.department_id = ${departments.id} and i.status = 'PENDING_APPROVAL'
      )`,
      totalCount: sql<number>`(
        select count(*)::int from ${indents} i where i.department_id = ${departments.id}
      )`,
    })
    .from(departments)
    .orderBy(asc(departments.name));
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface DepartmentReportRow {
  departmentName: string;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  avgApprovalHours: number | null;
}

export async function departmentReport(range: {
  from?: string;
  to?: string;
}): Promise<DepartmentReportRow[]> {
  const clauses = [];
  if (range.from) clauses.push(gte(indents.indentDate, range.from));
  if (range.to) clauses.push(lte(indents.indentDate, range.to));

  const rows = await db
    .select({
      departmentName: departments.name,
      total: count(),
      approved: sql<number>`count(*) filter (where ${indents.status} = 'APPROVED')::int`,
      rejected: sql<number>`count(*) filter (where ${indents.status} = 'REJECTED')::int`,
      pending: sql<number>`count(*) filter (where ${indents.status} = 'PENDING_APPROVAL')::int`,
      avgApprovalHours: sql<string | null>`
        avg(extract(epoch from (${indents.approvedAt} - ${indents.submittedAt})) / 3600)`,
    })
    .from(indents)
    .innerJoin(departments, eq(indents.departmentId, departments.id))
    .where(clauses.length ? and(...clauses) : undefined)
    .groupBy(departments.name)
    .orderBy(desc(count()));

  return rows.map((r) => ({
    ...r,
    avgApprovalHours: r.avgApprovalHours === null ? null : Number(r.avgApprovalHours),
  }));
}

export interface MonthlyReportRow {
  month: string;
  total: number;
  approved: number;
  rejected: number;
}

export async function monthlyReport(months = 12): Promise<MonthlyReportRow[]> {
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${indents.indentDate}), 'YYYY-MM')`,
      total: count(),
      approved: sql<number>`count(*) filter (where ${indents.status} = 'APPROVED')::int`,
      rejected: sql<number>`count(*) filter (where ${indents.status} = 'REJECTED')::int`,
    })
    .from(indents)
    .groupBy(sql`date_trunc('month', ${indents.indentDate})`)
    .orderBy(desc(sql`date_trunc('month', ${indents.indentDate})`))
    .limit(months);

  // Oldest first, so a chart or table reads left to right in time order.
  return rows.reverse();
}

export interface RequesterReportRow {
  requesterName: string;
  departmentName: string;
  total: number;
  approved: number;
  rejected: number;
}

export async function requesterReport(limit = 25): Promise<RequesterReportRow[]> {
  return db
    .select({
      requesterName: indents.requesterName,
      departmentName: departments.name,
      total: count(),
      approved: sql<number>`count(*) filter (where ${indents.status} = 'APPROVED')::int`,
      rejected: sql<number>`count(*) filter (where ${indents.status} = 'REJECTED')::int`,
    })
    .from(indents)
    .innerJoin(departments, eq(indents.departmentId, departments.id))
    .groupBy(indents.requesterName, departments.name)
    .orderBy(desc(count()))
    .limit(limit);
}

export interface PriorityReportRow {
  priority: Priority;
  total: number;
  avgApprovalHours: number | null;
}

export async function priorityReport(): Promise<PriorityReportRow[]> {
  const rows = await db
    .select({
      priority: indents.priority,
      total: count(),
      avgApprovalHours: sql<string | null>`
        avg(extract(epoch from (${indents.approvedAt} - ${indents.submittedAt})) / 3600)`,
    })
    .from(indents)
    .groupBy(indents.priority)
    .orderBy(asc(indents.priority));

  return rows.map((r) => ({
    ...r,
    avgApprovalHours: r.avgApprovalHours === null ? null : Number(r.avgApprovalHours),
  }));
}
