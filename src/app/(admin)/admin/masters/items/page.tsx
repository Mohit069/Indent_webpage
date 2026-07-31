import { Package } from 'lucide-react';
import { listItemCategories, listItems, listUoms } from '@/lib/queries';
import { createItem, createItemCategory } from '@/actions/admin';
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { MasterForm } from '@/components/master-form';

export const dynamic = 'force-dynamic';

export default async function AdminItemsPage() {
  const [items, uoms, categories] = await Promise.all([
    listItems(),
    listUoms(),
    listItemCategories(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/admin' }, { label: 'Item master' }]}
        title="Item Master"
        description="The catalog. It is never mandatory — anyone raising an indent may type a description instead, and the ones that keep recurring are worth adding here."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader title="Add an item" />
          <CardBody>
            <MasterForm
              action={createItem}
              submitLabel="Add item"
              columns={2}
              fields={[
                {
                  name: 'code',
                  label: 'Item code',
                  placeholder: 'e.g. BRG-6205',
                  required: true,
                },
                {
                  name: 'name',
                  label: 'Name',
                  placeholder: 'e.g. Deep groove ball bearing',
                  required: true,
                },
                {
                  name: 'specification',
                  label: 'Specification',
                  placeholder: 'e.g. 6205 2RS, 25×52×15 mm',
                },
                {
                  name: 'defaultUomId',
                  label: 'Default unit',
                  type: 'select',
                  required: true,
                  options: uoms.map((u) => ({
                    value: u.id,
                    label: `${u.code} — ${u.name}`,
                  })),
                },
                {
                  name: 'categoryId',
                  label: 'Category',
                  type: 'select',
                  options: categories.map((c) => ({ value: c.id, label: c.name })),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Add a category" />
          <CardBody>
            <MasterForm
              action={createItemCategory}
              submitLabel="Add category"
              columns={2}
              fields={[
                {
                  name: 'name',
                  label: 'Category name',
                  placeholder: 'e.g. Bearings & Power Transmission',
                  required: true,
                },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={
            <>
              Items
              <span className="ml-2 font-normal text-faint">({items.length})</span>
            </>
          }
        />
        {items.length === 0 ? (
          <EmptyState
            icon={<Package size={20} aria-hidden />}
            title="The catalog is empty"
            message="That is fine to start with. Descriptions can be typed on the indent, and you promote the ones that recur."
          />
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left">
                  <Th className="w-36">Code</Th>
                  <Th>Name</Th>
                  <Th>Specification</Th>
                  <Th className="w-52">Category</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="transition-colors hover:bg-raised">
                    <Td className="font-mono text-[13px] text-muted">{i.code}</Td>
                    <Td className="font-medium text-ink">{i.name}</Td>
                    <Td className="text-muted">{i.specification ?? '—'}</Td>
                    <Td className="text-muted">{i.categoryName ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
