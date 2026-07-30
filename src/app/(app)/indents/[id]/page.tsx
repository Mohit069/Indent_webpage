import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Printer, Pencil, AlertTriangle, XCircle } from 'lucide-react';
import { getIndent } from '@/lib/queries';
import { actorSnapshot, getActor } from '@/lib/actor';
import {
  allowedActions,
  availableActions,
  isEditable,
  STAGE_LABELS,
} from '@/lib/workflow';
import { hashLines } from '@/lib/indent-no';
import {
  Alert,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  CardNote,
  PageHeader,
  PriorityMark,
  StatusChip,
} from '@/components/ui';
import { DecideButtons } from '@/components/decide-buttons';
import { DecisionBanner } from '@/components/decision-banner';
import { SubmitBar } from '@/components/submit-bar';

export const dynamic = 'force-dynamic';

export default async function IndentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ decided?: string; no?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const [detail, actor, deciding] = await Promise.all([
    getIndent(id),
    actorSnapshot(),
    getActor(),
  ]);
  if (!detail) notFound();

  const { indent, department, raisedBy, lines, events } = detail;

  /*
   * What is legal for this indent, narrowed to what this person may do.
   * The server re-checks the same thing before writing — this only decides
   * which buttons are worth showing.
   */
  const actions = allowedActions(indent.status, deciding);
  const submitAction = actions.find((a) => a.action === 'submit');
  const decideActions = actions.filter((a) => a.action !== 'submit');
  const decisionsExist = availableActions(indent.status).some(
    (a) => a.action !== 'submit',
  );
  const canEdit = isEditable(indent.status);

  /*
   * Tamper check.
   *
   * Every transition recorded a hash of the lines as they stood at that moment.
   * If the current lines no longer hash to the last recorded value, something
   * changed after it was signed off — which on paper would have meant a figure
   * overwritten above a signature.
   */
  const currentHash = hashLines(lines);
  const lastSigned = [...events].reverse().find((e) => e.linesHash);
  const tampered = Boolean(
    lastSigned?.linesHash && lastSigned.linesHash !== currentHash,
  );

  const title = indent.indentNo ?? 'Unsubmitted draft';

  return (
    <div className="flex flex-col gap-6">
      <DecisionBanner decided={flash.decided} indentNo={flash.no} />

      <PageHeader
        breadcrumbs={[
          { label: 'Purchase', href: '/indents' },
          { label: 'Indents', href: '/indents' },
          { label: title },
        ]}
        title={<span className="font-mono">{title}</span>}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={indent.status} />
            <PriorityMark priority={indent.priority} variant="full" />
          </span>
        }
        description={
          <>
            {department?.name}
            {raisedBy ? ` · entered by ${raisedBy.name}` : ''} on{' '}
            <span className="tabular">{indent.indentDate}</span>
          </>
        }
        actions={
          <div className="flex gap-2 no-print">
            {canEdit && (
              <ButtonLink href={`/indents/${indent.id}/edit`} tone="secondary">
                <Pencil size={16} aria-hidden />
                Edit
              </ButtonLink>
            )}
            {indent.indentNo && (
              <ButtonLink href={`/indents/${indent.id}/print`} tone="secondary">
                <Printer size={16} aria-hidden />
                Print
              </ButtonLink>
            )}
          </div>
        }
      />

      {tampered && (
        <Alert tone="warning">
          <p className="flex items-start gap-2">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-600"
              aria-hidden
            />
            <span>
              <strong className="font-semibold">
                The items changed after this was signed off.
              </strong>{' '}
              The current rows do not match what was recorded at the last step. Check
              the history below before acting on it.
            </span>
          </p>
        </Alert>
      )}

      {indent.status === 'REJECTED' && (
        <Alert tone="danger">
          <p className="flex items-start gap-2">
            <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <span>
              <strong className="font-semibold">Rejected.</strong>{' '}
              {events.filter((e) => e.stage === 'REJECT').at(-1)?.note}
            </span>
          </p>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Requester" value={indent.requesterName} />
                <Detail label="Designation" value={indent.requesterDesignation} />
                <Detail label="Department" value={department?.name ?? '—'} />
                <Detail label="Indent date" value={indent.indentDate} mono />
                <Detail label="Expected date" value={indent.expectedDate ?? '—'} mono />
                {indent.purpose && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Detail label="Remarks / purpose" value={indent.purpose} />
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <>
                  Items
                  <span className="ml-2 font-normal text-faint">({lines.length})</span>
                </>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left">
                    <Th className="w-12 text-center">#</Th>
                    <Th>Description of item</Th>
                    <Th className="w-24">UOM</Th>
                    <Th className="w-32 text-right">Balance qty</Th>
                    <Th className="w-32 text-right">Required qty</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="transition-colors hover:bg-raised">
                      <Td className="tabular text-center text-xs text-faint">
                        {line.lineNo}
                      </Td>
                      <Td>
                        <div className="font-medium text-ink">
                          {line.itemName ?? line.customDescription}
                        </div>
                        {(line.specification ?? line.itemSpecification) && (
                          <div className="mt-0.5 text-xs text-muted">
                            {line.specification ?? line.itemSpecification}
                          </div>
                        )}
                        {/*
                          The "not in the item master" flag used to live here.
                          It went when the item name became free text: it was
                          then true of every line, and a note on every row tells
                          you nothing about any of them.
                        */}
                        {line.remarks && (
                          <div className="mt-1 text-xs italic text-muted">
                            {line.remarks}
                          </div>
                        )}
                      </Td>
                      <Td className="text-muted">{line.uomCode}</Td>
                      <Td className="tabular text-right text-muted">
                        {line.balanceQty ?? '—'}
                      </Td>
                      <Td className="tabular text-right font-medium text-ink">
                        {line.requiredQty}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CardNote>
              Balance quantity is the requesting department’s own figure, not a
              stock-system reading.
            </CardNote>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {(submitAction || decisionsExist) && (
            <Card className="no-print">
              <CardHeader
                title="Action"
                description={`Recorded against ${actor.name}.`}
              />
              <CardBody className="flex flex-col gap-4">
                {submitAction && (
                  <SubmitBar
                    indentId={indent.id}
                    actorName={actor.name}
                    actorDesignation={actor.designation}
                  />
                )}
                {decideActions.length > 0 ? (
                  <>
                    <DecideButtons
                      indentId={indent.id}
                      indentNo={indent.indentNo}
                      actions={decideActions}
                      actorName={actor.name}
                    />
                    <p className="text-xs leading-relaxed text-muted">
                      Approving asks for the shared password. Reject takes effect on
                      the click, with no confirmation.
                    </p>
                  </>
                ) : (
                  decisionsExist && (
                    <p className="rounded-lg border border-line bg-sunken px-3.5 py-3 text-sm leading-relaxed text-muted">
                      This indent is waiting for a decision, but{' '}
                      <span className="font-medium text-ink">{actor.name}</span> is not
                      set up to make one. Permissions are granted under Settings →
                      People.
                    </p>
                  )
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="flex flex-col gap-0">
                {events.map((event, i) => (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      {i < events.length - 1 && (
                        <span className="w-px flex-1 bg-line" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 pb-5 last:pb-0">
                      <p className="text-sm font-medium text-ink">
                        {STAGE_LABELS[event.stage]}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {event.actorNameSnapshot} · {event.actorDesignationSnapshot}
                      </p>
                      <p className="tabular text-xs text-faint">
                        {format(new Date(event.createdAt), 'dd MMM yyyy, HH:mm')}
                      </p>
                      {event.note && (
                        <p className="mt-2 rounded-lg border border-line bg-sunken px-3 py-2 text-xs leading-relaxed text-ink">
                          {event.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        className={`mt-1 text-sm leading-relaxed text-ink ${mono ? 'tabular font-mono text-[13px]' : ''}`}
      >
        {value}
      </dd>
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
    <td className={`border-b border-line px-5 py-3.5 align-top ${className ?? ''}`}>
      {children}
    </td>
  );
}
