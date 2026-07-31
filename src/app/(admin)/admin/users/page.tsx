import { format } from 'date-fns';
import { Users } from 'lucide-react';
import { listUsers } from '@/lib/admin-queries';
import { listDepartments } from '@/lib/queries';
import { requirePermission } from '@/lib/guard';
import { createUser } from '@/actions/users';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/rbac';
import type { UserRole } from '@/db/schema';
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
import { ActiveToggle, GrantToggle, ResetPassword, RolePicker } from './person-row';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Users — Administration' };

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

export default async function UsersPage() {
  const admin = await requirePermission('user:manage');

  const [users, departments] = await Promise.all([listUsers(), listDepartments()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Users' }]}
        title="Users"
        description="Who can sign in, what they may do, and which department they raise indents for."
      />

      <Card>
        <CardHeader
          title="Add a user"
          description="The email address is the login. Leave the password blank to create the account now and set one later."
        />
        <CardBody className="flex flex-col gap-5">
          <MasterForm
            action={createUser}
            submitLabel="Create user"
            columns={2}
            fields={[
              { name: 'name', label: 'Employee name', required: true },
              {
                name: 'designation',
                label: 'Designation',
                hint: 'Printed under their name on the indent.',
                required: true,
              },
              {
                name: 'email',
                label: 'Email',
                type: 'email',
                hint: 'This is what they sign in with.',
                required: true,
              },
              { name: 'phone', label: 'Phone', hint: 'For contact only.' },
              {
                name: 'role',
                label: 'Role',
                type: 'select',
                required: true,
                options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
              },
              {
                name: 'departmentId',
                label: 'Department',
                type: 'select',
                options: departments.map((d) => ({ value: d.id, label: d.name })),
                hint: 'For a Head of Department. Ignored for the other roles.',
              },
              {
                name: 'password',
                label: 'Initial password',
                type: 'password',
                hint: 'At least 12 characters. They must change it at first sign-in.',
              },
            ]}
          />

          <div className="rounded-xl border border-line bg-sunken p-4">
            <p className="text-xs font-medium text-ink">What each role can do</p>
            <dl className="mt-2 flex flex-col gap-1.5">
              {ROLES.map((r) => (
                <div key={r} className="flex flex-wrap gap-x-2 text-xs leading-relaxed">
                  <dt className="font-medium text-ink">{ROLE_LABELS[r]}</dt>
                  <dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <>
              Users
              <span className="ml-2 font-normal text-faint">({users.length})</span>
            </>
          }
          description="Approve and Reject are extra grants on top of the role — for deputising while the Super Admin is away."
        />

        {users.length === 0 ? (
          <EmptyState
            icon={<Users size={20} aria-hidden />}
            title="No users yet"
            message="Add the heads of department who will raise indents."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[70rem] text-sm">
              <thead>
                <tr className="text-left">
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Department</Th>
                  <Th className="w-48">Role</Th>
                  <Th className="w-24 text-center">Approve</Th>
                  <Th className="w-24 text-center">Reject</Th>
                  <Th>Last sign-in</Th>
                  <Th className="text-right">Status</Th>
                  <Th className="text-right">Password</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === admin.id;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        'border-b border-line transition-colors hover:bg-raised',
                        !u.isActive && 'opacity-60',
                      )}
                    >
                      <Td>
                        <span className="font-medium text-ink">{u.name}</span>
                        {isSelf && <span className="ml-1.5 text-xs text-faint">(you)</span>}
                        <span className="block text-xs text-faint">{u.designation}</span>
                      </Td>
                      <Td className="text-muted">
                        {u.email ? (
                          <a href={`mailto:${u.email}`} className="text-primary hover:underline">
                            {u.email}
                          </a>
                        ) : (
                          /*
                           * The three placeholder people who predate accounts.
                           * No address means no way to sign in, which is exactly
                           * right for a name that only appears on old events.
                           */
                          <span className="text-faint" title="Cannot sign in — no email">
                            No login
                          </span>
                        )}
                      </Td>
                      <Td className="text-muted">
                        {u.departmentName ?? <span className="text-faint">—</span>}
                      </Td>
                      <Td>
                        <RolePicker personId={u.id} role={u.role} isSelf={isSelf} />
                      </Td>
                      <Td className="text-center">
                        <GrantToggle
                          personId={u.id}
                          grant="canApprove"
                          granted={u.canApprove}
                          label="approve"
                          disabled={u.role === 'SUPER_ADMIN'}
                        />
                      </Td>
                      <Td className="text-center">
                        <GrantToggle
                          personId={u.id}
                          grant="canReject"
                          granted={u.canReject}
                          label="reject"
                          disabled={u.role === 'SUPER_ADMIN'}
                        />
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {u.lastLoginAt ? (
                          format(u.lastLoginAt, 'd MMM yyyy')
                        ) : (
                          <span className="text-faint">Never</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <ActiveToggle personId={u.id} isActive={u.isActive} isSelf={isSelf} />
                      </Td>
                      <Td className="text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          {!u.hasPassword && u.email && <Badge tone="warning">Not set</Badge>}
                          {u.hasPassword && u.mustChangePassword && (
                            <Badge tone="info">Must change</Badge>
                          )}
                          {u.email && <ResetPassword personId={u.id} name={u.name} />}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <CardNote>
          Accounts are disabled rather than deleted — a person’s name is on the history of
          every indent they touched, and that record has to keep resolving. Disabling ends
          their sessions immediately.
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
        'border-b border-line bg-sunken px-4 py-3 text-xs font-medium whitespace-nowrap text-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;
}
