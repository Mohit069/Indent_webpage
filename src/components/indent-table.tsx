import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { Clock } from 'lucide-react';
import type { IndentListRow } from '@/lib/queries';
import type { Person } from '@/db/schema';
import { allowedActions, isAwaitingDecision } from '@/lib/workflow';
import { PriorityMark, StatusChip, cn } from '@/components/ui';
import { DecideButtons } from '@/components/decide-buttons';

/*
 * The indent list.
 *
 * Approve and Reject sit on the row itself, so deciding an indent does not mean
 * opening it first. Aging is an explicit column because it is the thing paper
 * hides best — a form parked on a desk for six days looks identical to one
 * raised this morning.
 */

function ageOf(row: IndentListRow): string {
  const since = row.submittedAt ?? row.updatedAt;
  return formatDistanceToNowStrict(new Date(since), { addSuffix: false });
}

function isStale(row: IndentListRow): boolean {
  if (!row.submittedAt || !isAwaitingDecision(row.status)) return false;
  return (Date.now() - new Date(row.submittedAt).getTime()) / 86_400_000 >= 3;
}

const TH = 'px-5 py-3 text-xs font-medium text-muted whitespace-nowrap';

export function IndentTable({
  rows,
  actorName,
  deciding,
}: {
  rows: IndentListRow[];
  actorName: string;
  /** Who this computer is set to, and therefore which buttons are theirs to see. */
  deciding: Person | null;
}) {
  return (
    <>
      {/* Desktop. A capped height so the header genuinely freezes on long lists. */}
      <div className="hidden max-h-[70vh] overflow-auto md:block">
        <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left">
              {[
                'Indent No.',
                'Date',
                'Department',
                'Requester',
                'Items',
                'Priority',
                'Status',
                'Waiting',
                'Decision',
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(TH, 'border-b border-line bg-sunken')}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const actions = allowedActions(row.status, deciding).filter(
                (a) => a.action !== 'submit',
              );
              return (
                <tr key={row.id} className="group transition-colors hover:bg-raised">
                  <Td>
                    <Link
                      href={`/indents/${row.id}`}
                      className="font-mono text-[13px] font-medium text-primary hover:underline"
                    >
                      {row.indentNo ?? 'Draft'}
                    </Link>
                  </Td>
                  <Td className="tabular text-muted">{row.indentDate}</Td>
                  <Td>{row.departmentName}</Td>
                  <Td>
                    <div className="font-medium text-ink">{row.requesterName}</div>
                    <div className="text-xs text-muted">{row.requesterDesignation}</div>
                  </Td>
                  <Td className="tabular text-muted">{row.lineCount}</Td>
                  <Td>
                    <PriorityMark priority={row.priority} />
                  </Td>
                  <Td>
                    <StatusChip status={row.status} />
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs',
                        isStale(row) ? 'font-medium text-amber-700' : 'text-muted',
                      )}
                    >
                      {isStale(row) && <Clock size={13} aria-hidden />}
                      {ageOf(row)}
                    </span>
                  </Td>
                  <Td>
                    {actions.length > 0 ? (
                      <DecideButtons
                        indentId={row.id}
                        indentNo={row.indentNo}
                        actions={actions}
                        actorName={actorName}
                        size="sm"
                      />
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards. A nine-column table on a phone is unusable. */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => {
          const actions = allowedActions(row.status, deciding).filter(
            (a) => a.action !== 'submit',
          );
          return (
            <li key={row.id} className="flex flex-col gap-3 p-4">
              <Link href={`/indents/${row.id}`} className="flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-medium text-primary">
                      {row.indentNo ?? 'Draft'}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-ink">
                      {row.requesterName}
                    </p>
                    <p className="truncate text-xs text-muted">{row.departmentName}</p>
                  </div>
                  <StatusChip status={row.status} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityMark priority={row.priority} />
                  <span className="tabular text-xs text-muted">{row.indentDate}</span>
                  <span className="text-xs text-muted">{row.lineCount} items</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs',
                      isStale(row) ? 'font-medium text-amber-700' : 'text-muted',
                    )}
                  >
                    {isStale(row) && <Clock size={12} aria-hidden />}
                    waiting {ageOf(row)}
                  </span>
                </div>
              </Link>

              {actions.length > 0 && (
                <DecideButtons
                  indentId={row.id}
                  indentNo={row.indentNo}
                  actions={actions}
                  actorName={actorName}
                  size="sm"
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'border-b border-line px-5 py-3.5 align-middle group-last:border-0',
        className,
      )}
    >
      {children}
    </td>
  );
}
