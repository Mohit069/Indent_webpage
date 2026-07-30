import { notFound, redirect } from 'next/navigation';
import {
  getIndent,
  listDepartments,
  listItems,
  listUoms,
  requesterSuggestions,
} from '@/lib/queries';
import { isEditable } from '@/lib/workflow';
import { IndentForm } from '@/components/indent-form';
import { PageHeader, StatusChip } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function EditIndentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getIndent(id);
  if (!detail) notFound();

  const { indent, lines } = detail;

  if (!isEditable(indent.status)) redirect(`/indents/${id}`);

  const [items, uoms, departments, suggestions] = await Promise.all([
    listItems(),
    listUoms(),
    listDepartments(),
    requesterSuggestions(),
  ]);

  const title = indent.indentNo ?? 'Draft';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Purchase', href: '/indents' },
          { label: 'Indents', href: '/indents' },
          { label: title, href: `/indents/${indent.id}` },
          { label: 'Edit' },
        ]}
        title={indent.indentNo ? `Edit ${indent.indentNo}` : 'Edit draft'}
        badge={<StatusChip status={indent.status} />}
        description={
          indent.status === 'RETURNED'
            ? 'This was sent back for changes. Fix it, then send it again.'
            : 'Not sent yet — it has no number. Sending it for approval issues one.'
        }
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
        initial={{
          id: indent.id,
          indentDate: indent.indentDate,
          departmentId: indent.departmentId,
          requesterName: indent.requesterName,
          requesterDesignation: indent.requesterDesignation,
          purpose: indent.purpose ?? '',
          expectedDate: indent.expectedDate ?? '',
          priority: indent.priority,
          lines: lines.map((l) => ({
            /*
             * A line that came from the catalog is loaded as its item's name.
             *
             * The editor no longer picks from the catalog, so without this
             * fallback an older catalog line would open with an empty
             * description box and be refused on save as having no item at all.
             */
            customDescription: l.customDescription ?? l.itemName ?? '',
            specification: l.specification ?? '',
            uomCode: l.uomCode,
            balanceQty: l.balanceQty ?? '',
            requiredQty: l.requiredQty,
            remarks: l.remarks ?? '',
          })),
        }}
      />
    </div>
  );
}
