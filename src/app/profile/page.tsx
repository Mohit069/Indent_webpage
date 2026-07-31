import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { departments } from '@/db/schema';
import { requireUser } from '@/lib/guard';
import { permissionsFor, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/rbac';
import { signOut } from '@/actions/auth';
import { Badge, ButtonLink, Card, CardBody, CardHeader, buttonClass } from '@/components/ui';

/*
 * Your own account.
 *
 * Standalone rather than inside either shell: both the HOD and the Super Admin
 * reach it, and duplicating the page into two route groups so that each could
 * keep its own sidebar would be two copies of the same thing to keep in step.
 * A back link costs less.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile — Purchase Indent' };

export default async function ProfilePage() {
  const user = await requireUser();

  const department = user.departmentId
    ? (
        await db
          .select({ name: departments.name })
          .from(departments)
          .where(eq(departments.id, user.departmentId))
          .limit(1)
      )[0]
    : null;

  const permissions = [...permissionsFor(user)].sort();
  const home = user.role === 'SUPER_ADMIN' ? '/admin' : '/indents';

  return (
    <main className="min-h-dvh bg-sunken px-4 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link
          href={home}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} aria-hidden />
          Back
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-ink">{user.name}</h1>
          <p className="mt-1 text-sm text-muted">{user.designation}</p>
        </div>

        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Row label="Email" value={user.email ?? 'Not set'} />
              <Row label="Role" value={ROLE_LABELS[user.role]} />
              <Row label="Department" value={department?.name ?? 'All departments'} />
              <Row
                label="Last signed in"
                value={
                  user.lastLoginAt ? format(user.lastLoginAt, 'd MMM yyyy, HH:mm') : 'First visit'
                }
              />
            </dl>

            <p className="mt-5 rounded-xl border border-line bg-sunken p-3.5 text-sm leading-relaxed text-muted">
              {ROLE_DESCRIPTIONS[user.role]}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What you can do"
            description="Granted by your role, plus anything assigned to you individually."
          />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {permissions.map((p) => (
                <Badge key={p} tone="neutral">
                  {p}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Password"
            description="Changing it signs you out of every other browser."
          />
          <CardBody className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/change-password" tone="secondary">
              <KeyRound size={16} aria-hidden />
              Change password
            </ButtonLink>

            {/* The action passed straight to `action`, so signing out still
                works with JavaScript unavailable. */}
            <form action={signOut}>
              <button type="submit" className={buttonClass('secondary', 'md')}>
                Sign out
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}
