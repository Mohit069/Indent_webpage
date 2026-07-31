import { listIndentsPaged } from '@/lib/admin-queries';
import { listDepartments } from '@/lib/queries';
import { requirePermission } from '@/lib/guard';
import { AdminIndentTable, IndentFilters } from '@/components/admin-table';
import { Card, PageHeader } from '@/components/ui';
import type { IndentStatus, Priority } from '@/db/schema';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'All Indents — Administration' };

const PAGE_SIZE = 20;

const PRIORITIES = ['ASAP', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'] as const;
const STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

export default async function AllIndentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('indent:view:all');

  const sp = await searchParams;

  /*
   * Both come from the URL and both are compared against a Postgres enum, so an
   * unrecognised value has to become "no filter" rather than reach the query —
   * Postgres would refuse the comparison and the page would 500 on a mistyped
   * link.
   *
   * `find` rather than `includes` with a cast: it narrows to the literal union
   * on the way out, so nothing has to be asserted back into the type.
   */
  const priority: Priority | undefined = PRIORITIES.find((p) => p === sp.priority);
  const status: IndentStatus | undefined = STATUSES.find((s) => s === sp.status);

  const [result, departments] = await Promise.all([
    listIndentsPaged(
      {
        statuses: status ? [status] : undefined,
        search: sp.q,
        departmentId: sp.department,
        priority,
      },
      Number(sp.page) || 1,
      PAGE_SIZE,
    ),
    listDepartments(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'All Indents' }]}
        title="All Indents"
        description="Every indent raised, in any state, across every department."
      />

      <IndentFilters
        action="/admin/indents"
        values={sp}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      />

      <Card>
        <AdminIndentTable
          page={result}
          baseHref="/admin/indents"
          params={{
            q: sp.q,
            status: sp.status,
            priority: sp.priority,
            department: sp.department,
          }}
          emptyTitle="No indents match"
          emptyMessage="Try clearing the filters, or widening the search."
        />
      </Card>
    </div>
  );
}
