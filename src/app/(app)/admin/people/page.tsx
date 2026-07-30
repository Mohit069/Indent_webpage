import { Users, Info } from 'lucide-react';
import { listAllPeople } from '@/lib/queries';
import { createPerson } from '@/actions/admin';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  CardNote,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { MasterForm } from '@/components/master-form';
import { PersonRow, RoleToggle } from './person-row';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const people = await listAllPeople();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/admin' }, { label: 'People' }]}
        title="People"
        description="The names offered in the “acting as” picker, printed in the signature boxes of the indent, and who among them may approve or reject."
      />

      <Alert tone="info">
        <p className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>
            <strong className="font-semibold">
              These permissions guard against mistakes, not against intent.
            </strong>{' '}
            There is no sign-in, so the name this computer is set to is a choice
            anyone can change. Someone can pick a person who may approve and act as
            them. The flags stop the wrong person deciding by accident and keep the
            history honest; they become a real restraint once a login verifies the
            email address recorded here.
          </span>
        </p>
      </Alert>

      <Card>
        <CardHeader
          title="Add a person"
          description="Name and designation are printed on the indent. Email is recorded against them; permissions decide which buttons they see."
        />
        <CardBody>
          <MasterForm
            action={createPerson}
            submitLabel="Add person"
            columns={2}
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
                name: 'email',
                label: 'Email',
                type: 'email',
                placeholder: 'e.g. suresh@example.com',
                hint: 'Optional today. This is what a sign-in would verify later.',
              },
              {
                name: 'phone',
                label: 'Phone',
                placeholder: 'Optional',
                hint: 'For contact only — never used to identify anyone.',
              },
              {
                name: 'canApprove',
                label: 'May approve indents',
                type: 'checkbox',
                hint: 'Shows the Approve button. The shared password is still asked for.',
              },
              {
                name: 'canReject',
                label: 'May reject indents',
                type: 'checkbox',
                hint: 'Shows the Reject button. A written reason is still required.',
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
          description="Approve and Reject can be granted or withdrawn at any time."
        />
        {people.length === 0 ? (
          <EmptyState
            icon={<Users size={20} aria-hidden />}
            title="Nobody added yet"
            message="Add the two or three people who use this, so their names appear on the printed indent."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left">
                  <Th>Name</Th>
                  <Th>Designation</Th>
                  <Th>Email</Th>
                  <Th className="w-28 text-center">Approve</Th>
                  <Th className="w-28 text-center">Reject</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-raised">
                    <Td className="font-medium text-ink">{p.name}</Td>
                    <Td className="text-muted">{p.designation}</Td>
                    <Td className="text-muted">
                      {p.email ? (
                        <a
                          href={`mailto:${p.email}`}
                          className="text-primary hover:underline"
                        >
                          {p.email}
                        </a>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>
                    <Td className="text-center">
                      <RoleToggle
                        personId={p.id}
                        role="canApprove"
                        granted={p.canApprove}
                        label="approve"
                      />
                    </Td>
                    <Td className="text-center">
                      <RoleToggle
                        personId={p.id}
                        role="canReject"
                        granted={p.canReject}
                        label="reject"
                      />
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
