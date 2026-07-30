import Link from 'next/link';
import { Users, Building2, Package, Ruler, ChevronRight } from 'lucide-react';
import { listAllPeople, listDepartments, listItems, listUoms } from '@/lib/queries';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [people, departments, items, uoms] = await Promise.all([
    listAllPeople(),
    listDepartments(),
    listItems(),
    listUoms(),
  ]);

  const sections = [
    {
      href: '/admin/people',
      title: 'People',
      count: people.length,
      icon: Users,
      description:
        'The names offered in the “acting as” picker, and printed on the indent. Not accounts — there is nothing to sign into.',
    },
    {
      href: '/admin/departments',
      title: 'Departments',
      count: departments.length,
      icon: Building2,
      description: 'Every department an indent can be raised for.',
    },
    {
      href: '/admin/items',
      title: 'Item master',
      count: items.length,
      icon: Package,
      description: 'The catalog. Grows from what people actually indent.',
    },
    {
      href: '/admin/uoms',
      title: 'Units of measure',
      count: uoms.length,
      icon: Ruler,
      description: 'Nos, Kg, Litre, Metre, and anything else you buy in.',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings' }]}
        title="Settings"
        description="Master data. Changes take effect immediately, for everyone."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-[var(--shadow-raised)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <s.icon size={18} aria-hidden />
                </span>
                <h2 className="text-sm font-semibold text-ink">{s.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular text-sm font-medium text-muted">{s.count}</span>
                <ChevronRight
                  size={16}
                  aria-hidden
                  className="text-faint transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
