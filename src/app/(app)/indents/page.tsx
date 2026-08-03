import { FileText, Plus, Search } from 'lucide-react';
import { listDepartments, listIndents, statusCounts } from '@/lib/queries';
import { actorSnapshot, getActor } from '@/lib/actor';
import { OPEN_STATUSES } from '@/lib/workflow';
import { can, canAny } from '@/lib/rbac';
import { IndentTable } from '@/components/indent-table';
import { DecisionToast } from '@/components/decision-toast';
import {
  ButtonLink,
  Card,
  CardNote,
  EmptyState,
  PageHeader,
  StatTile,
  buttonClass,
  inputClass,
  selectClass,
} from '@/components/ui';
import type { IndentStatus } from '@/db/schema';

export const dynamic = 'force-dynamic';

/*
 * Every indent, at whatever stage it has reached.
 *
 * There is no separate queue screen: this one list, filtered, is the whole of
 * the app besides raising a new indent — which is why the tiles above it are
 * links rather than decoration. They are the tabs.
 */

/**
 * Statuses this page will filter by.
 *
 * Compared against a Postgres enum, so a value from the URL that is not one of
 * these has to become "no filter" rather than reach the query — Postgres
 * refuses the comparison outright and the page would 500 on a hand-edited link.
 * `find` rather than `includes`, so it narrows to the union on the way out.
 */
const FILTERABLE = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'CLOSED',
  'REJECTED',
] as const satisfies readonly IndentStatus[];

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    dept?: string;
    decided?: string;
    no?: string;
  }>;
}) {
  const params = await searchParams;
  const statusFilter: IndentStatus | undefined = FILTERABLE.find(
    (s) => s === params.status,
  );

  // "Awaiting" covers the legacy in-between states too, so nothing is stranded.
  const statuses: IndentStatus[] | undefined =
    statusFilter === 'PENDING_APPROVAL'
      ? ['PENDING_APPROVAL', 'PENDING_PURCHASE', 'RETURNED']
      : statusFilter
        ? [statusFilter]
        : undefined;

  const [rows, counts, departments, actor, deciding] = await Promise.all([
    listIndents({
      statuses,
      departmentId: params.dept || undefined,
      search: params.q,
    }),
    statusCounts(),
    listDepartments(),
    actorSnapshot(),
    getActor(),
  ]);

  const awaiting =
    (counts.PENDING_APPROVAL ?? 0) +
    (counts.PENDING_PURCHASE ?? 0) +
    (counts.RETURNED ?? 0);
  const open = OPEN_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const filtered = Boolean(params.q || statusFilter || params.dept);

  const canDecide = canAny(deciding, ['indent:approve', 'indent:reject']);
  const canComplete = can(deciding, 'indent:complete');

  return (
    <div className="flex flex-col gap-6">
      <DecisionToast decided={params.decided} indentNo={params.no} />

      <PageHeader
        breadcrumbs={[{ label: 'Purchase', href: '/indents' }, { label: 'Indents' }]}
        title="Indents"
        description="Every indent raised — waiting, approved, delivered or refused. Open one to act on it."
        actions={
          <ButtonLink href="/indents/new" tone="primary">
            <Plus size={16} aria-hidden />
            New Indent
          </ButtonLink>
        }
      />

      {/*
        Five tiles, in the order an indent actually passes through them: waiting
        for a decision, approved but not yet delivered, delivered and finished —
        with drafts and rejections at the ends as the two ways out.

        "Awaiting material" is the one that did not exist before. It is the tile
        worth looking at on a Monday morning: an indent approved a fortnight ago
        and still sitting there is the failure this stage was added to surface,
        and it was previously indistinguishable from one approved an hour ago.
      */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Awaiting decision"
          value={awaiting}
          accent
          href="/indents?status=PENDING_APPROVAL"
        />
        <StatTile
          label="Awaiting material"
          value={counts.APPROVED ?? 0}
          href="/indents?status=APPROVED"
        />
        <StatTile
          label="Completed"
          value={counts.CLOSED ?? 0}
          href="/indents?status=CLOSED"
        />
        <StatTile label="Drafts" value={counts.DRAFT ?? 0} href="/indents?status=DRAFT" />
        <StatTile
          label="Rejected"
          value={counts.REJECTED ?? 0}
          href="/indents?status=REJECTED"
        />
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line p-5">
          <label className="flex min-w-56 flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Search</span>
            <span className="relative block">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Indent number, requester, purpose"
                className={`${inputClass} pl-10`}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Status</span>
            <select
              name="status"
              defaultValue={statusFilter ?? ''}
              className={`${selectClass} min-w-44`}
            >
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Awaiting approval</option>
              <option value="APPROVED">Approved — awaiting material</option>
              <option value="CLOSED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Department</span>
            <select
              name="dept"
              defaultValue={params.dept ?? ''}
              className={`${selectClass} min-w-44`}
            >
              <option value="">All</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button type="submit" className={buttonClass('secondary', 'md')}>
              Apply
            </button>
            {filtered && (
              <a href="/indents" className={buttonClass('ghost', 'md')}>
                Clear
              </a>
            )}
          </div>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={20} aria-hidden />}
            title={filtered ? 'No matching indents' : 'Nothing here yet'}
            message={
              filtered
                ? 'No indent matches that filter. Try clearing the search.'
                : 'No indents have been raised yet.'
            }
            action={
              filtered ? (
                <ButtonLink href="/indents" tone="secondary">
                  Clear filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/indents/new" tone="primary">
                  <Plus size={16} aria-hidden />
                  Raise the first one
                </ButtonLink>
              )
            }
          />
        ) : (
          <IndentTable rows={rows} actorName={actor.name} deciding={deciding} />
        )}

        {/*
          `can`, not the two boolean columns this used to read.
          `deciding.canApprove` is the per-person grant only — a Super Admin,
          who approves by virtue of the role, has it set to false and was being
          told they could not decide anything. The note now asks the same
          question the buttons do.
        */}
        {rows.length > 0 && (canDecide || canComplete) && (
          <CardNote>
            {canDecide &&
              'Approving asks you to confirm. Reject takes effect on the click, with no confirmation. '}
            {canComplete &&
              'Mark completed once the material has reached the store and been checked — it closes the indent for good.'}
          </CardNote>
        )}

        {rows.length > 0 && !canDecide && !canComplete && open > 0 && (
          <CardNote>
            {actor.name} is not set up to decide indents, so no decision buttons are
            shown. Permissions are granted under Settings → People.
          </CardNote>
        )}
      </Card>
    </div>
  );
}
