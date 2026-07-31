import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { listDepartmentsWithStats } from '@/lib/admin-queries';
import { requirePermission } from '@/lib/guard';
import { createDepartment } from '@/actions/admin';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardNote,
  EmptyState,
  PageHeader,
  cn,
} from '@/components/ui';
import { MasterForm } from '@/components/master-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Departments — Administration' };

export default async function AdminDepartmentsPage() {
  await requirePermission('department:manage');

  const departments = await listDepartmentsWithStats();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Administration', href: '/admin' },
          { label: 'Departments' },
        ]}
        title="Departments"
        description="Every indent belongs to one department. The head is whoever holds the HOD role for it."
      />

      <Card>
        <CardHeader title="Add a department" />
        <CardBody>
          <MasterForm
            action={createDepartment}
            submitLabel="Add department"
            columns={2}
            fields={[
              {
                name: 'name',
                label: 'Name',
                placeholder: 'e.g. Maintenance',
                required: true,
              },
              {
                name: 'code',
                label: 'Short code',
                placeholder: 'e.g. MAINT',
                hint: 'Used in reports. Letters, digits and hyphens.',
                required: true,
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <>
              Departments
              <span className="ml-2 font-normal text-faint">({departments.length})</span>
            </>
          }
          description="Assign a head by giving someone the HOD role for the department, under Users."
        />

        {departments.length === 0 ? (
          <EmptyState
            icon={<Building2 size={20} aria-hidden />}
            title="No departments yet"
            message="Add the first one above — production, maintenance, quality, stores, and so on."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="text-left">
                  <Th>Department</Th>
                  <Th className="w-24">Code</Th>
                  <Th>Head of department</Th>
                  <Th className="w-24 text-right">Users</Th>
                  <Th className="w-28 text-right">Pending</Th>
                  <Th className="w-28 text-right">Total</Th>
                  <Th className="w-24 text-right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr
                    key={d.id}
                    className={cn(
                      'border-b border-line transition-colors hover:bg-raised',
                      !d.isActive && 'opacity-60',
                    )}
                  >
                    <Td className="font-medium text-ink">{d.name}</Td>
                    <Td className="font-mono text-xs text-muted">{d.code}</Td>
                    <Td className="text-muted">
                      {d.headName ?? (
                        <Link href="/admin/users" className="text-primary hover:underline">
                          Not assigned
                        </Link>
                      )}
                    </Td>
                    <Td className="tabular text-right text-muted">{d.userCount}</Td>
                    <Td className="tabular text-right">
                      {d.pendingCount > 0 ? (
                        <Link
                          href={`/admin/pending?department=${d.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {d.pendingCount}
                        </Link>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </Td>
                    <Td className="tabular text-right text-muted">
                      {d.totalCount > 0 ? (
                        <Link
                          href={`/admin/indents?department=${d.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {d.totalCount}
                        </Link>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Badge tone={d.isActive ? 'success' : 'neutral'}>
                        {d.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <CardNote>
          A department typed on an indent form that does not exist yet is added automatically,
          with a code derived from its initials.
        </CardNote>
      </Card>
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
