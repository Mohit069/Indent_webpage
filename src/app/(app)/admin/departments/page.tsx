import { Building2 } from 'lucide-react';
import { listDepartments } from '@/lib/queries';
import { createDepartment } from '@/actions/admin';
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { MasterForm } from '@/components/master-form';

export const dynamic = 'force-dynamic';

export default async function AdminDepartmentsPage() {
  const departments = await listDepartments();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/admin' }, { label: 'Departments' }]}
        title="Departments"
        description="Every indent belongs to one department, chosen on the form."
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
              <span className="ml-2 font-normal text-faint">
                ({departments.length})
              </span>
            </>
          }
        />
        {departments.length === 0 ? (
          <EmptyState
            icon={<Building2 size={20} aria-hidden />}
            title="No departments yet"
            message="Add the first one above — production, maintenance, quality, stores, and so on."
          />
        ) : (
          <ul className="divide-y divide-line">
            {departments.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-raised"
              >
                <span className="text-sm font-medium text-ink">{d.name}</span>
                <span className="font-mono text-xs text-muted">{d.code}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
