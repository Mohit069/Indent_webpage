import { listIndentsPaged } from '@/lib/admin-queries';
import { listDepartments } from '@/lib/queries';
import { requirePermission } from '@/lib/guard';
import { AdminIndentTable, IndentFilters } from '@/components/admin-table';
import { Card, PageHeader } from '@/components/ui';
import type { Priority } from '@/db/schema';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Pending Approvals — Administration' };

const PAGE_SIZE = 20;

export default async function PendingApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('indent:view:all');

  const sp = await searchParams;

  /*
   * The priority arrives from the URL, so it is checked against the enum rather
   * than passed through. An unrecognised value becomes "no filter" instead of
   * reaching the query — Postgres would refuse the comparison and the page
   * would 500 on a mistyped link.
   */
  const priority: Priority | undefined = (
    ['ASAP', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'] as const
  ).find((p) => p === sp.priority);

  const page = Number(sp.page) || 1;

  const [result, departments] = await Promise.all([
    listIndentsPaged(
      {
        statuses: ['PENDING_APPROVAL'],
        search: sp.q,
        departmentId: sp.department,
        priority,
      },
      page,
      PAGE_SIZE,
    ),
    listDepartments(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Pending Approvals' }]}
        title="Pending Approvals"
        description="Everything sent for approval and not yet decided. Most urgent first, then longest waiting."
      />

      <IndentFilters
        action="/admin/pending"
        values={sp}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        showStatus={false}
      />

      <Card>
        <AdminIndentTable
          page={result}
          baseHref="/admin/pending"
          params={{ q: sp.q, priority: sp.priority, department: sp.department }}
          emptyTitle="Nothing waiting"
          emptyMessage="Every indent that has been sent for approval has been decided."
        />
      </Card>
    </div>
  );
}
