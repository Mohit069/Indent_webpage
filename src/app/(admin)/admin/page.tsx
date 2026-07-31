import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileEdit,
  Flame,
  Timer,
  XCircle,
} from 'lucide-react';
import { dashboardStats, listIndentsPaged, recentActivity } from '@/lib/admin-queries';
import { requirePermission } from '@/lib/guard';
import { Card, CardHeader, EmptyState, PageHeader, PriorityMark } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dashboard — Administration' };

/** Hours as something a person would say: 0.5 → "30m", 1.5 → "1h 30m", 30 → "1d 6h". */
function humaniseHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function Tile({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  href,
  note,
}: {
  label: string;
  value: string | number;
  icon: typeof Clock;
  tone?: 'neutral' | 'warning' | 'success' | 'danger' | 'critical';
  href?: string;
  note?: string;
}) {
  const tones = {
    neutral: 'bg-raised text-muted',
    warning: 'bg-warning-soft text-amber-700',
    success: 'bg-success-soft text-green-700',
    danger: 'bg-danger-soft text-danger',
    critical: 'bg-danger text-white',
  } as const;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          <Icon size={16} aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </>
  );

  const base =
    'flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]';

  return href ? (
    <Link
      href={href}
      className={`${base} transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-[var(--shadow-raised)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export default async function AdminDashboard() {
  await requirePermission('indent:view:all');

  const [stats, waiting, activity] = await Promise.all([
    dashboardStats(),
    listIndentsPaged({ statuses: ['PENDING_APPROVAL'] }, 1, 6),
    recentActivity(8),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Administration' }]}
        title="Dashboard"
        description="Everything waiting on a decision, and how the last few days have gone."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Tile
          label="Pending approval"
          value={stats.pendingApproval}
          icon={Clock}
          tone="warning"
          href="/admin/pending"
          note={stats.pendingApproval === 0 ? 'Nothing waiting' : 'Waiting on you'}
        />
        <Tile
          label="Critical (ASAP) waiting"
          value={stats.criticalPending}
          icon={Flame}
          tone={stats.criticalPending > 0 ? 'critical' : 'neutral'}
          href="/admin/pending?priority=ASAP"
          note={stats.criticalPending > 0 ? 'Needed as soon as possible' : undefined}
        />
        <Tile
          label="Average approval time"
          value={humaniseHours(stats.avgApprovalHours)}
          icon={Timer}
          note={stats.avgApprovalHours === null ? 'Nothing approved yet' : 'Submit to decision'}
        />
        <Tile
          label="Approved today"
          value={stats.approvedToday}
          icon={CheckCircle2}
          tone="success"
        />
        <Tile label="Rejected today" value={stats.rejectedToday} icon={XCircle} tone="danger" />
        <Tile
          label="Drafts"
          value={stats.totalDrafts}
          icon={FileEdit}
          note="Not yet sent for approval"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Waiting for approval"
            description="Most urgent first, then longest waiting."
            action={
              <Link
                href="/admin/pending"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                See all
                <ArrowRight size={13} aria-hidden />
              </Link>
            }
          />

          {waiting.rows.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={20} aria-hidden />}
              title="Nothing waiting"
              message="Every indent that has been sent for approval has been decided."
            />
          ) : (
            <ul className="divide-y divide-line">
              {waiting.rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/admin/indents/${row.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-raised"
                  >
                    <PriorityMark priority={row.priority} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {row.indentNo ?? 'Draft'}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {row.requesterName} · {row.departmentName} · {row.lineCount}{' '}
                        {row.lineCount === 1 ? 'item' : 'items'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {row.submittedAt
                        ? formatDistanceToNow(row.submittedAt, { addSuffix: true })
                        : '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            description="Every action, most recent first."
            action={
              <Link
                href="/admin/activity"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Full log
                <ArrowRight size={13} aria-hidden />
              </Link>
            }
          />

          {activity.length === 0 ? (
            <EmptyState
              icon={<Activity size={20} aria-hidden />}
              title="Nothing recorded yet"
              message="Actions appear here as people use the system."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 px-5 py-3">
                  <p className="text-sm leading-snug text-ink">{entry.summary}</p>
                  <p className="text-xs text-muted">
                    {entry.actorNameSnapshot} ·{' '}
                    {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
