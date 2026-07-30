import { Building2 } from 'lucide-react';
import {
  listDepartments,
  listItems,
  listUoms,
  requesterSuggestions,
} from '@/lib/queries';
import { IndentForm } from '@/components/indent-form';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewIndentPage() {
  const [items, uoms, departments, suggestions] = await Promise.all([
    listItems(),
    listUoms(),
    listDepartments(),
    requesterSuggestions(),
  ]);

  if (departments.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <EmptyState
            icon={<Building2 size={20} aria-hidden />}
            title="No departments yet"
            message="An indent belongs to a department, so add at least one before raising the first indent."
            action={
              <ButtonLink href="/admin/departments" tone="primary">
                Add a department
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Purchase', href: '/indents' },
          { label: 'Indents', href: '/indents' },
          { label: 'New' },
        ]}
        title="New Purchase Indent"
        badge={<Badge tone="neutral">Not sent yet</Badge>}
        description="Fill this in and send it for approval. The indent number is issued at that point."
      />

      <IndentForm
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          specification: i.specification,
        }))}
        uoms={uoms}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        requesterSuggestions={suggestions}
      />
    </div>
  );
}
