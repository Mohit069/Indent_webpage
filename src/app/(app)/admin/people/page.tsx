import { Users } from 'lucide-react';
import { listAllPeople } from '@/lib/queries';
import { createPerson } from '@/actions/admin';
import {
  Card,
  CardBody,
  CardHeader,
  CardNote,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { MasterForm } from '@/components/master-form';
import { PersonRow } from './person-row';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const people = await listAllPeople();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/admin' }, { label: 'People' }]}
        title="People"
        description="The names offered in the “acting as” picker, and printed in the signature boxes of the indent. These are not accounts — there is no password and nothing to sign into, so anyone can pick any name."
      />

      <Card>
        <CardHeader title="Add a person" />
        <CardBody>
          <MasterForm
            action={createPerson}
            submitLabel="Add person"
            fields={[
              {
                name: 'name',
                label: 'Name',
                placeholder: 'e.g. Suresh Sharma',
                required: true,
              },
              {
                name: 'designation',
                label: 'Designation',
                placeholder: 'e.g. Head — Maintenance',
                hint: 'Printed under their name on the indent.',
                required: true,
              },
              {
                name: 'phone',
                label: 'Phone',
                placeholder: 'Optional',
                hint: 'For contact only — never used to identify anyone.',
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <>
              People
              <span className="ml-2 font-normal text-faint">({people.length})</span>
            </>
          }
        />
        {people.length === 0 ? (
          <EmptyState
            icon={<Users size={20} aria-hidden />}
            title="Nobody added yet"
            message="Add the two or three people who use this, so their names appear on the printed indent."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left">
                  <Th>Name</Th>
                  <Th>Designation</Th>
                  <Th>Phone</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-raised">
                    <Td className="font-medium text-ink">{p.name}</Td>
                    <Td className="text-muted">{p.designation}</Td>
                    <Td className="tabular font-mono text-[13px] text-muted">
                      {p.phone ?? '—'}
                    </Td>
                    <Td className="text-right">
                      <PersonRow personId={p.id} isActive={p.isActive} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CardNote>
          People are deactivated rather than deleted — their name is on the history of
          every indent they touched, and that record has to keep resolving.
        </CardNote>
      </Card>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-line bg-sunken px-5 py-3 text-xs font-medium text-muted whitespace-nowrap ${className ?? ''}`}
    >
      {children}
    </th>
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
    <td className={`border-b border-line px-5 py-3.5 align-middle ${className ?? ''}`}>
      {children}
    </td>
  );
}
