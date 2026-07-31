import Link from 'next/link';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Eye, Inbox } from 'lucide-react';
import type { AdminIndentRow, Page } from '@/lib/admin-queries';
import type { IndentStatus, Priority } from '@/db/schema';
import { STATUS_LABELS } from '@/lib/workflow';
import {
  EmptyState,
  PRIORITY_ORDER,
  PRIORITY_SHORT,
  PriorityMark,
  StatusChip,
  cn,
  inputClass,
  selectClass,
} from '@/components/ui';

/*
 * The admin indent table, its filters and its pager.
 *
 * All three are server components, and the filters are an ordinary GET form.
 * That is a deliberate choice over client-side state: the URL ends up holding
 * the whole query, so a filtered view can be bookmarked, reloaded, sent to
 * somebody, and opened with JavaScript switched off. It also means the dashboard
 * can link straight to /admin/pending?priority=ASAP and land on a real filtered
 * page rather than one that has to be re-filtered after hydration.
 */

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Statuses worth filtering by. The legacy ones are deliberately absent — they
 *  exist so old rows resolve, not so anyone searches for them. */
const FILTERABLE_STATUSES: IndentStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
];

export interface FilterValues {
  q?: string;
  status?: string;
  priority?: string;
  department?: string;
  from?: string;
  to?: string;
}

export function IndentFilters({
  action,
  values,
  departments,
  showStatus = true,
}: {
  /** Where the form submits. Its own page, so filtering is a plain navigation. */
  action: string;
  values: FilterValues;
  departments: { id: string; name: string }[];
  /** Hidden on the Pending page, where the status is the point of the page. */
  showStatus?: boolean;
}) {
  return (
    <form
      action={action}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]"
    >
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Search</span>
        <input
          type="search"
          name="q"
          defaultValue={values.q ?? ''}
          placeholder="Indent number, requester, department…"
          className={cn(inputClass, 'h-10')}
        />
      </label>

      {showStatus && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Status</span>
          <select
            name="status"
            defaultValue={values.status ?? ''}
            className={cn(selectClass, 'h-10 w-44')}
          >
            <option value="">Any status</option>
            {FILTERABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Priority</span>
        <select
          name="priority"
          defaultValue={values.priority ?? ''}
          className={cn(selectClass, 'h-10 w-36')}
        >
          <option value="">Any priority</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_SHORT[p]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Department</span>
        <select
          name="department"
          defaultValue={values.department ?? ''}
          className={cn(selectClass, 'h-10 w-48')}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
        >
          Filter
        </button>
        {/* A link, not a reset button: reset restores the form's defaults, which
            are the filters currently applied — it would appear to do nothing. */}
        <Link
          href={action}
          className="h-10 rounded-lg px-3 text-sm font-medium leading-10 text-muted transition-colors hover:text-ink"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pager
// ---------------------------------------------------------------------------

export function Pagination({
  page,
  pageCount,
  total,
  baseHref,
  params,
  noun = ['indent', 'indents'],
}: {
  page: number;
  pageCount: number;
  total: number;
  baseHref: string;
  /** The current filters, so paging does not silently drop them. */
  params: Record<string, string | undefined>;
  /**
   * Singular and plural. Both spelled out rather than derived by adding "s" —
   * the pager is shared with the activity log, which counts "entries", and a
   * rule that produced "entrys" would be worse than no rule.
   */
  noun?: [string, string];
}) {
  if (total === 0) return null;

  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v);
    }
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return s ? `${baseHref}?${s}` : baseHref;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-xs text-muted">
        Page <span className="font-medium text-ink">{page}</span> of {pageCount} ·{' '}
        <span className="font-medium text-ink">{total}</span>{' '}
        {total === 1 ? noun[0] : noun[1]}
      </p>

      <div className="flex items-center gap-1.5">
        <PagerLink href={href(page - 1)} disabled={page <= 1} label="Previous">
          <ChevronLeft size={15} aria-hidden />
          Previous
        </PagerLink>
        <PagerLink href={href(page + 1)} disabled={page >= pageCount} label="Next">
          Next
          <ChevronRight size={15} aria-hidden />
        </PagerLink>
      </div>
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className =
    'inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-medium transition-colors';

  // A disabled anchor is still focusable and still navigable by keyboard, so
  // the unavailable direction is rendered as a span rather than a dead link.
  if (disabled) {
    return (
      <span aria-disabled className={cn(className, 'cursor-not-allowed bg-raised text-faint')}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} className={cn(className, 'bg-surface text-ink hover:bg-raised')}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function AdminIndentTable({
  page,
  baseHref,
  params,
  emptyTitle,
  emptyMessage,
}: {
  page: Page<AdminIndentRow>;
  baseHref: string;
  params: Record<string, string | undefined>;
  emptyTitle: string;
  emptyMessage: string;
}) {
  if (page.rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={20} aria-hidden />}
        title={emptyTitle}
        message={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="text-left">
              <Th>Indent No.</Th>
              <Th>Department</Th>
              <Th>Requester</Th>
              <Th>Priority</Th>
              <Th>Submitted</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr key={row.id} className="border-b border-line transition-colors hover:bg-raised">
                <Td>
                  <Link
                    href={`/admin/indents/${row.id}`}
                    className="font-medium text-ink hover:text-primary hover:underline"
                  >
                    {row.indentNo ?? <span className="text-faint">Draft</span>}
                  </Link>
                  <span className="ml-2 text-xs text-faint">
                    {row.lineCount} {row.lineCount === 1 ? 'item' : 'items'}
                  </span>
                </Td>
                <Td className="text-muted">{row.departmentName}</Td>
                <Td>
                  <span className="text-ink">{row.requesterName}</span>
                  {row.requesterDesignation && (
                    <span className="block text-xs text-faint">{row.requesterDesignation}</span>
                  )}
                </Td>
                <Td>
                  <PriorityMark priority={row.priority as Priority} />
                </Td>
                <Td className="whitespace-nowrap text-muted">
                  {row.submittedAt ? (
                    format(row.submittedAt, 'd MMM yyyy')
                  ) : (
                    <span className="text-faint">Not sent</span>
                  )}
                </Td>
                <Td>
                  <StatusChip status={row.status} />
                </Td>
                <Td className="text-right">
                  {/*
                   * View only. The brief is explicit that approving must happen
                   * after opening the indent, not from a row in a list — the
                   * whole point of a review step is that something was read.
                   */}
                  <Link
                    href={`/admin/indents/${row.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-ink transition-colors hover:bg-raised"
                  >
                    <Eye size={14} aria-hidden />
                    View
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        baseHref={baseHref}
        params={params}
      />
    </>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-sunken px-5 py-3 text-xs font-medium whitespace-nowrap text-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-5 py-3.5 align-middle', className)}>{children}</td>;
}
