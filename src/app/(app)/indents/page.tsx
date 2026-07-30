import { FileText, Plus, Search } from 'lucide-react';
import { listDepartments, listIndents, statusCounts } from '@/lib/queries';
import { actorSnapshot, getActor } from '@/lib/actor';
import { OPEN_STATUSES } from '@/lib/workflow';
import { IndentTable } from '@/components/indent-table';
import { DecisionBanner } from '@/components/decision-banner';
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
 * Every indent, approved or not, with Approve and Reject on the row.
 *
 * There is no separate queue screen: this one list, filtered, is the whole of
 * the app besides raising a new indent.
 */

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
  const statusFilter = params.status as IndentStatus | undefined;

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

  return (
    <div className="flex flex-col gap-6">
      <DecisionBanner decided={params.decided} indentNo={params.no} />

      <PageHeader
        breadcrumbs={[{ label: 'Purchase', href: '/indents' }, { label: 'Indents' }]}
        title="Indents"
        description="Every indent raised, approved or not. Approve and Reject are on the row."
        actions={
          <ButtonLink href="/indents/new" tone="primary">
            <Plus size={16} aria-hidden />
            New Indent
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Awaiting decision"
          value={awaiting}
          accent
          href="/indents?status=PENDING_APPROVAL"
        />
        <StatTile label="Drafts" value={counts.DRAFT ?? 0} href="/indents?status=DRAFT" />
        <StatTile
          label="Approved"
          value={counts.APPROVED ?? 0}
          href="/indents?status=APPROVED"
        />
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
              <option value="APPROVED">Approved</option>
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

        {open > 0 && rows.length > 0 && (
          <CardNote>
            {deciding?.canApprove || deciding?.canReject
              ? 'Approving or rejecting asks for the shared password.'
              : `${actor.name} is not set up to decide indents, so no decision buttons are shown. Permissions are granted under Settings → People.`}
          </CardNote>
        )}
      </Card>
    </div>
  );
}
