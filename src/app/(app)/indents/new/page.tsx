import {
  listDepartments,
  listItems,
  listUoms,
  requesterSuggestions,
} from '@/lib/queries';
import { IndentForm } from '@/components/indent-form';
import { Badge, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/*
 * There is no longer a "you must add a department first" dead end here.
 *
 * The department is typed, and the server creates it if it is new, so a fresh
 * install can raise its first indent without a detour through Settings.
 */

export default async function NewIndentPage() {
  const [items, uoms, departments, suggestions] = await Promise.all([
    listItems(),
    listUoms(),
    listDepartments(),
    requesterSuggestions(),
  ]);

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
        departments={departments.map((d) => d.name)}
        requesterSuggestions={suggestions}
      />
    </div>
  );
}
