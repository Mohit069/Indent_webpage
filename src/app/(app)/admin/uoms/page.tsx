import { Ruler } from 'lucide-react';
import { listUoms } from '@/lib/queries';
import { createUom } from '@/actions/admin';
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { MasterForm } from '@/components/master-form';

export const dynamic = 'force-dynamic';

export default async function AdminUomsPage() {
  const uoms = await listUoms();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/admin' }, { label: 'Units' }]}
        title="Units of Measure"
        description="What quantities are counted in. Every indent line carries one."
      />

      <Card>
        <CardHeader title="Add a unit" />
        <CardBody>
          <MasterForm
            action={createUom}
            submitLabel="Add unit"
            columns={2}
            fields={[
              { name: 'code', label: 'Code', placeholder: 'e.g. KG', required: true },
              {
                name: 'name',
                label: 'Name',
                placeholder: 'e.g. Kilogram',
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
              Units
              <span className="ml-2 font-normal text-faint">({uoms.length})</span>
            </>
          }
        />
        {uoms.length === 0 ? (
          <EmptyState
            icon={<Ruler size={20} aria-hidden />}
            title="No units yet"
            message="Add the ones you buy in — Nos, Kg, Litre, Metre, Set, Box."
          />
        ) : (
          <ul className="divide-y divide-line">
            {uoms.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-raised"
              >
                <span className="font-mono text-sm font-medium text-ink">{u.code}</span>
                <span className="text-sm text-muted">{u.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
