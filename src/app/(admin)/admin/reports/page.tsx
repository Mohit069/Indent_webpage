import { BarChart3 } from 'lucide-react';
import {
  departmentReport,
  monthlyReport,
  priorityReport,
  requesterReport,
} from '@/lib/admin-queries';
import { requirePermission } from '@/lib/guard';
import {
  Card,
  CardHeader,
  CardNote,
  EmptyState,
  PageHeader,
  PRIORITY_SHORT,
  PriorityMark,
  cn,
  inputClass,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reports — Administration' };

/** Hours as something a person would say. Shared shape with the dashboard. */
function humaniseHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** A proportion as a bar, so the shape of the data reads before the numbers do. */
function Bar({ value, total, tone }: { value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-raised">
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular w-8 text-right text-xs text-muted">{value}</span>
    </span>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission('report:view');

  const { from, to } = await searchParams;

  const [byDepartment, byMonth, byRequester, byPriority] = await Promise.all([
    departmentReport({ from, to }),
    monthlyReport(12),
    requesterReport(15),
    priorityReport(),
  ]);

  const grandTotal = byDepartment.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Reports' }]}
        title="Reports"
        description="Volume, outcomes and how long decisions are taking."
      />

      {/* A plain GET form, so a date range ends up in the URL and can be
          bookmarked or sent to somebody. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ''}
            className={cn(inputClass, 'h-10 w-44')}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ''}
            className={cn(inputClass, 'h-10 w-44')}
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
        >
          Apply
        </button>
        <p className="ml-auto self-center text-xs text-muted">
          The date range applies to the department report. The others cover all time.
        </p>
      </form>

      {grandTotal === 0 ? (
        <Card>
          <EmptyState
            icon={<BarChart3 size={20} aria-hidden />}
            title="Nothing to report yet"
            message="Once indents have been raised and decided, the numbers appear here."
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title="By department"
              description={
                from || to
                  ? `Indents dated ${from || 'the beginning'} to ${to || 'today'}.`
                  : 'All indents, every department.'
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="text-left">
                    <Th>Department</Th>
                    <Th className="w-24 text-right">Total</Th>
                    <Th className="w-36">Approved</Th>
                    <Th className="w-36">Rejected</Th>
                    <Th className="w-28 text-right">Pending</Th>
                    <Th className="w-32 text-right">Avg. decision</Th>
                  </tr>
                </thead>
                <tbody>
                  {byDepartment.map((r) => (
                    <tr
                      key={r.departmentName}
                      className="border-b border-line transition-colors hover:bg-raised"
                    >
                      <Td className="font-medium text-ink">{r.departmentName}</Td>
                      <Td className="tabular text-right">{r.total}</Td>
                      <Td>
                        <Bar value={r.approved} total={r.total} tone="bg-green-500" />
                      </Td>
                      <Td>
                        <Bar value={r.rejected} total={r.total} tone="bg-red-500" />
                      </Td>
                      <Td className="tabular text-right text-muted">{r.pending}</Td>
                      <Td className="tabular text-right text-muted">
                        {humaniseHours(r.avgApprovalHours)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CardNote>
              Average decision time counts only indents that were approved — a rejection
              does not stamp an approval time.
            </CardNote>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="By month" description="The last twelve months of activity." />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <Th>Month</Th>
                      <Th className="w-20 text-right">Raised</Th>
                      <Th className="w-32">Approved</Th>
                      <Th className="w-32">Rejected</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMonth.map((r) => (
                      <tr
                        key={r.month}
                        className="border-b border-line transition-colors hover:bg-raised"
                      >
                        <Td className="tabular font-medium text-ink">{r.month}</Td>
                        <Td className="tabular text-right">{r.total}</Td>
                        <Td>
                          <Bar value={r.approved} total={r.total} tone="bg-green-500" />
                        </Td>
                        <Td>
                          <Bar value={r.rejected} total={r.total} tone="bg-red-500" />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="By priority"
                description="Whether the urgent ones are actually being decided faster."
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <Th>Priority</Th>
                      <Th className="w-24 text-right">Total</Th>
                      <Th className="w-40 text-right">Average decision time</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPriority.map((r) => (
                      <tr
                        key={r.priority}
                        className="border-b border-line transition-colors hover:bg-raised"
                      >
                        <Td>
                          <PriorityMark priority={r.priority} />
                        </Td>
                        <Td className="tabular text-right">{r.total}</Td>
                        <Td className="tabular text-right text-muted">
                          {humaniseHours(r.avgApprovalHours)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CardNote>
                If {PRIORITY_SHORT.ASAP} is not decided noticeably faster than the rest, the
                priority field is not doing anything.
              </CardNote>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="By requester"
              description="Who raises the most, and how their indents are decided."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left">
                    <Th>Requester</Th>
                    <Th>Department</Th>
                    <Th className="w-24 text-right">Total</Th>
                    <Th className="w-36">Approved</Th>
                    <Th className="w-36">Rejected</Th>
                  </tr>
                </thead>
                <tbody>
                  {byRequester.map((r) => (
                    <tr
                      key={`${r.requesterName}-${r.departmentName}`}
                      className="border-b border-line transition-colors hover:bg-raised"
                    >
                      <Td className="font-medium text-ink">{r.requesterName}</Td>
                      <Td className="text-muted">{r.departmentName}</Td>
                      <Td className="tabular text-right">{r.total}</Td>
                      <Td>
                        <Bar value={r.approved} total={r.total} tone="bg-green-500" />
                      </Td>
                      <Td>
                        <Bar value={r.rejected} total={r.total} tone="bg-red-500" />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
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
