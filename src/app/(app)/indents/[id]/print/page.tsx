import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { getIndent } from '@/lib/queries';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

/*
 * The printed indent.
 *
 * Deliberately a near-facsimile of the carbon-copy book: same header block,
 * same five-column table, same three signature boxes at the foot. Format parity
 * is not nostalgia — the shop floor and the vendors have been reading this
 * layout for years, and matching it is what makes the cutover survivable.
 *
 * The boxes carry the name recorded at each step and a ruled line beneath it.
 * Since nothing in this app verifies who anyone is, the line is there to be
 * signed by hand — the printed page remains the thing that carries a real
 * signature.
 */

export default async function PrintIndentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getIndent(id);
  if (!detail) notFound();

  const { indent, department, lines, events } = detail;

  const submitEvent = events.find((e) => e.stage === 'SUBMIT');
  const receiptEvent = events.find((e) => e.stage === 'PURCHASE_RECEIPT');
  const approvalEvent = events.find((e) => e.stage === 'FINAL_APPROVAL');

  // The paper book ruled twelve rows; keep the block a constant height so the
  // signature boxes always land in the same place on the page.
  const blankRows = Math.max(0, 12 - lines.length);

  return (
    <div className="mx-auto max-w-[210mm] p-4 print:p-0">
      <div className="mb-4 flex items-center justify-between gap-3 no-print">
        <Link
          href={`/indents/${indent.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to indent
        </Link>
        <PrintButton />
      </div>

      <div className="print-sheet border border-line bg-white p-6 text-black shadow-[var(--shadow-raised)] print:shadow-none">
        <div className="border-b-2 border-black pb-3 text-center">
          {/*
            The wordmark is set in type here rather than placed as the logo, and
            that is a deliberate exception to the branding everywhere else.

            The artwork is a gold gradient on transparency. This sheet is white,
            so on screen the palest third of it — most of "QUARTZ MASTERPIECES"
            — barely registers; and on the laser printer a plant office actually
            owns, gold renders as pale grey and it registers less. The one place
            the logo would look right is a colour print, which is not how a
            purchase indent gets filed.

            Black type at this weight photocopies, faxes and files legibly,
            which is the whole job of a document header.
          */}
          <h1 className="text-lg font-bold uppercase tracking-[0.28em]">
            Artizia Quartz
          </h1>
          {/*
            The registered entity, kept under the brand rather than replaced by
            it. This sheet is a purchase document — an auditor or a supplier
            reads the legal name, not the trading name.
          */}
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">
            Marudhar Quartz Surfaces Private Limited
          </p>
          <p className="mx-auto mt-1 max-w-[150mm] text-[9px] leading-snug">
            Plot No.- PA 008-020-023, Mahindra World City Jaipur Ltd, Multi Product SEZ,
            PO- Mahindra World City, Village- Bhambhoriya, Tehsil- Sanganer, Jaipur,
            Rajasthan - 302029
          </p>
          <h2 className="mt-2 text-sm font-bold uppercase tracking-[0.2em]">
            Purchase Indent Form
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-x-8 border-b border-black py-3 text-[11px]">
          <div className="flex flex-col gap-1.5">
            <Row label="Date" value={format(new Date(indent.indentDate), 'dd/MM/yyyy')} />
            <Row label="Requester Name" value={indent.requesterName} />
            <Row label="Department Name" value={department?.name ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Row label="Indent No." value={indent.indentNo ?? 'DRAFT'} mono />
            <Row label="Designation" value={indent.requesterDesignation} />
            <Row
              label="Expected Date"
              value={
                indent.expectedDate
                  ? format(new Date(indent.expectedDate), 'dd/MM/yyyy')
                  : '—'
              }
            />
          </div>
        </div>

        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <Th className="w-8">S.No.</Th>
              <Th>Description of ITEM (Item name and Specification)</Th>
              <Th className="w-16">UOM</Th>
              <Th className="w-20">Balance Qty.</Th>
              <Th className="w-20">Required Qty.</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <Td className="text-center tabular">{line.lineNo}</Td>
                <Td>
                  {line.itemName ?? line.customDescription}
                  {line.itemSpecification && (
                    <span className="text-[9px]">
                      {' — '}
                      {line.itemSpecification}
                    </span>
                  )}
                </Td>
                <Td className="text-center">{line.uomCode}</Td>
                <Td className="tabular text-right">{line.balanceQty ?? '—'}</Td>
                <Td className="tabular text-right font-semibold">{line.requiredQty}</Td>
              </tr>
            ))}
            {Array.from({ length: blankRows }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <Td className="h-5">&nbsp;</Td>
                <Td />
                <Td />
                <Td />
                <Td />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-x border-b border-black p-2 text-[10px]">
          <span className="font-semibold">Remarks/Purpose: </span>
          {indent.purpose ?? ''}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-[10px]">
          <SignatureBox
            title="Name of HOD"
            name={submitEvent?.actorNameSnapshot}
            designation={submitEvent?.actorDesignationSnapshot}
            at={submitEvent?.createdAt}
          />
          <SignatureBox
            title="Received by Purchases Dept."
            name={receiptEvent?.actorNameSnapshot}
            designation={receiptEvent?.actorDesignationSnapshot}
            at={receiptEvent?.createdAt}
          />
          <SignatureBox
            title="Approved by / Approving Authority"
            name={approvalEvent?.actorNameSnapshot}
            designation={approvalEvent?.actorDesignationSnapshot}
            at={approvalEvent?.createdAt}
          />
        </div>

        <p className="mt-4 border-t border-black pt-2 text-[8px] leading-relaxed">
          Generated from the Purchase Indent System on{' '}
          {format(new Date(), 'dd/MM/yyyy HH:mm')}. Names shown above are those recorded in
          the system at each step; sign against them to authorise this indent.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 font-semibold">{label}:</span>
      <span className={`flex-1 border-b border-dotted border-black ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border border-black px-1.5 py-1 font-semibold ${className ?? ''}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`border border-black px-1.5 py-1 align-top ${className ?? ''}`}>
      {children}
    </td>
  );
}

/** A stage nobody has reached yet prints as an empty ruled box, exactly as the
 *  pad does. Reached stages print the recorded name above a signing line. */
function SignatureBox({
  title,
  name,
  designation,
  at,
}: {
  title: string;
  name?: string;
  designation?: string;
  at?: Date;
}) {
  return (
    <div className="border border-black p-2">
      <p className="font-semibold">{title}</p>
      <div className="mt-3 min-h-[3.4rem]">
        {name ? (
          <>
            <div className="mb-3 h-5 border-b border-black" aria-hidden />
            <p className="font-medium">{name}</p>
            <p className="text-[9px]">{designation}</p>
            <p className="mt-1 text-[9px] tabular">
              {at ? format(new Date(at), 'dd/MM/yyyy HH:mm') : ''}
            </p>
          </>
        ) : (
          <p className="text-[9px] italic text-neutral-500">Pending</p>
        )}
      </div>
    </div>
  );
}
