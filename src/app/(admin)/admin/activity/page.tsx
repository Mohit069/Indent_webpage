import Link from 'next/link';
import { format, isToday, isYesterday } from 'date-fns';
import { Activity } from 'lucide-react';
import { listActivityPaged } from '@/lib/admin-queries';
import { requirePermission } from '@/lib/guard';
import { Pagination } from '@/components/admin-table';
import { Badge, Card, CardHeader, CardNote, EmptyState, PageHeader, cn } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Activity Log — Administration' };

const PAGE_SIZE = 50;

const ENTITY_FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'indent', label: 'Indents' },
  { value: 'person', label: 'Users' },
  { value: 'department', label: 'Departments' },
  { value: 'auth', label: 'Sign-ins' },
];

/** Colour by what kind of thing happened, so a failed sign-in or a rejection
 *  is findable by scanning rather than by reading every line. */
function toneFor(action: string): BadgeTone {
  if (action.endsWith('approve')) return 'success';
  if (action.endsWith('reject') || action.includes('failed')) return 'danger';
  if (action.startsWith('user.') || action.startsWith('department.')) return 'info';
  if (action.startsWith('auth.')) return 'neutral';
  return 'neutral';
}

/** "Today", "Yesterday", then the date — the heading a person would use. */
function dayLabel(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, d MMMM yyyy');
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('activity:view');

  const sp = await searchParams;
  const entityType = ENTITY_FILTERS.some((f) => f.value === sp.type && f.value)
    ? sp.type
    : undefined;

  const result = await listActivityPaged(Number(sp.page) || 1, PAGE_SIZE, { entityType });

  /*
   * Grouped by day as we walk the list, rather than with a lookup per row.
   * The rows already arrive newest-first, so a change of date is simply the
   * point at which a new heading is needed.
   */
  const groups: { day: string; entries: typeof result.rows }[] = [];
  for (const entry of result.rows) {
    const day = dayLabel(entry.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Activity Log' }]}
        title="Activity Log"
        description="Every action anybody has taken. Nothing here is ever edited or removed."
      />

      <div className="flex flex-wrap gap-1.5">
        {ENTITY_FILTERS.map((f) => {
          const active = (sp.type ?? '') === f.value;
          return (
            <Link
              key={f.value || 'all'}
              href={f.value ? `/admin/activity?type=${f.value}` : '/admin/activity'}
              className={cn(
                'h-9 rounded-lg border px-3.5 text-xs font-medium leading-9 transition-colors',
                active
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-line-strong bg-surface text-muted hover:bg-raised hover:text-ink',
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="History"
          description={`${result.total} ${result.total === 1 ? 'entry' : 'entries'} recorded.`}
        />

        {result.rows.length === 0 ? (
          <EmptyState
            icon={<Activity size={20} aria-hidden />}
            title="Nothing recorded"
            message="Actions appear here as people sign in and work on indents."
          />
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.day}>
                <p className="sticky top-14 z-10 border-y border-line bg-sunken px-5 py-2 text-xs font-medium text-muted lg:top-0">
                  {group.day}
                </p>
                <ul className="divide-y divide-line">
                  {group.entries.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="tabular w-14 shrink-0 pt-0.5 text-xs text-faint">
                        {format(entry.createdAt, 'HH:mm')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug text-ink">
                          {entry.summary}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {entry.actorNameSnapshot}
                        </span>
                      </span>
                      <Badge tone={toneFor(entry.action)} className="shrink-0">
                        {entry.action}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              baseHref="/admin/activity"
              params={{ type: sp.type }}
              noun={['entry', 'entries']}
            />
          </>
        )}

        <CardNote>
          Separate from an indent’s own history, which is what the printed signature boxes
          are drawn from. This is the wider record: sign-ins, accounts, and departments as
          well as indents.
        </CardNote>
      </Card>
    </div>
  );
}
