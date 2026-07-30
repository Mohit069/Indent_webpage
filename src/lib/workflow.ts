import type { IndentStatus, EventStage } from '@/db/schema';

/*
 * The workflow.
 *
 * Deliberately short: a draft is submitted, and then it is either approved or
 * rejected. Nothing else.
 *
 *   DRAFT --submit--> PENDING_APPROVAL --approve--> APPROVED
 *                                     \--reject---> REJECTED
 *
 * Approve and Reject are gated by a shared password. There are no accounts, so
 * the password is what separates "anyone who can open the page" from "anyone
 * who is allowed to authorise a purchase".
 *
 * The wider set of states (with-purchase, returned, procured, withdrawn) still
 * exists in the database enum so old rows keep resolving, but nothing in the UI
 * produces them any more.
 */

export type WorkflowAction = 'submit' | 'approve' | 'reject';

export interface TransitionRule {
  action: WorkflowAction;
  from: IndentStatus[];
  to: IndentStatus;
  stage: EventStage;
  /** Label shown on the button that performs it. */
  label: string;
  /**
   * Whether the shared password is required to perform it.
   *
   * This also decides the shape of the control: an action that needs the
   * password opens a dialog to ask for it, and one that does not is a single
   * click that acts immediately.
   */
  requiresPassword: boolean;
  tone: 'primary' | 'neutral' | 'danger';
}

export const TRANSITIONS: TransitionRule[] = [
  {
    action: 'submit',
    from: ['DRAFT'],
    to: 'PENDING_APPROVAL',
    stage: 'SUBMIT',
    label: 'Submit Indent',
    requiresPassword: false,
    tone: 'primary',
  },
  {
    action: 'approve',
    // PENDING_PURCHASE is accepted so indents raised before the workflow was
    // shortened can still be finished rather than stranded.
    from: ['PENDING_APPROVAL', 'PENDING_PURCHASE', 'RETURNED'],
    to: 'APPROVED',
    stage: 'FINAL_APPROVAL',
    label: 'Approve',
    requiresPassword: true,
    tone: 'primary',
  },
  {
    action: 'reject',
    from: ['PENDING_APPROVAL', 'PENDING_PURCHASE', 'RETURNED'],
    to: 'REJECTED',
    stage: 'REJECT',
    label: 'Reject',
    /*
     * One click, no password and no written reason.
     *
     * The asymmetry with Approve is deliberate rather than an oversight:
     * approving commits money, rejecting does not, and the person who raised
     * the indent can raise it again. What guards this now is the canReject
     * permission — the button is only shown to, and only accepted from,
     * someone who holds it.
     */
    requiresPassword: false,
    tone: 'danger',
  },
];

/** The permission columns on a person that gate a decision. */
export type PersonRole = 'canApprove' | 'canReject';

/**
 * Which permission a person needs to perform an action, if any.
 *
 * Submitting needs none: handing an indent over is not an authorisation. The
 * gate is on the two actions where money starts moving.
 */
export function requiredRole(action: WorkflowAction): PersonRole | null {
  if (action === 'approve') return 'canApprove';
  if (action === 'reject') return 'canReject';
  return null;
}

/** Everything this person is allowed to do to an indent in this state. */
export function allowedActions(
  status: IndentStatus,
  person: { canApprove: boolean; canReject: boolean } | null,
): TransitionRule[] {
  return availableActions(status).filter((rule) => {
    const needed = requiredRole(rule.action);
    if (!needed) return true;
    return Boolean(person?.[needed]);
  });
}

/** Only a draft may be edited. Once submitted, the items are fixed. */
export function isEditable(status: IndentStatus): boolean {
  return status === 'DRAFT';
}

/** Everything legal for an indent in this state. */
export function availableActions(status: IndentStatus): TransitionRule[] {
  return TRANSITIONS.filter((t) => t.from.includes(status));
}

export function findTransition(
  action: WorkflowAction,
  status: IndentStatus,
): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.action === action && t.from.includes(status));
}

/** Statuses that still need a decision from someone. */
export const OPEN_STATUSES: IndentStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PENDING_PURCHASE',
  'RETURNED',
];

export function isAwaitingDecision(status: IndentStatus): boolean {
  return ['PENDING_APPROVAL', 'PENDING_PURCHASE', 'RETURNED'].includes(status);
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<IndentStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Awaiting Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  // Legacy states, kept so historical rows still render sensibly.
  PENDING_PURCHASE: 'Awaiting Approval',
  RETURNED: 'Awaiting Approval',
  CANCELLED: 'Withdrawn',
  CLOSED: 'Procured',
};

/**
 * Tailwind classes per status, so state reads at a glance in a list.
 *
 * Every pairing here clears WCAG AA for normal text against its own tint:
 * the darkest of them, amber-800 on amber-50, sits at 7.4:1.
 */
export const STATUS_STYLES: Record<IndentStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 ring-gray-200',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-800 ring-amber-200',
  PENDING_PURCHASE: 'bg-amber-50 text-amber-800 ring-amber-200',
  RETURNED: 'bg-amber-50 text-amber-800 ring-amber-200',
  APPROVED: 'bg-green-50 text-green-800 ring-green-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 ring-gray-200',
  CLOSED: 'bg-teal-50 text-teal-800 ring-teal-200',
};

export const STAGE_LABELS: Record<EventStage, string> = {
  CREATE: 'Created',
  SUBMIT: 'Submitted',
  FINAL_APPROVAL: 'Approved',
  REJECT: 'Rejected',
  PURCHASE_RECEIPT: 'Received by Purchase Dept.',
  RETURN: 'Returned for changes',
  CANCEL: 'Withdrawn',
  CLOSE: 'Marked procured',
  AMEND: 'Amended',
};
