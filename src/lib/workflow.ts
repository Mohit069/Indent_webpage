import type { IndentStatus, EventStage } from '@/db/schema';
import { can, type Permission, type Principal } from '@/lib/rbac';

/*
 * The workflow.
 *
 * A draft is submitted; it is approved or rejected; and an approved indent is
 * closed off once the material it asked for has actually turned up.
 *
 *   DRAFT --submit--> PENDING_APPROVAL --approve--> APPROVED --complete--> CLOSED
 *                                     \--reject---> REJECTED
 *
 * That last step is the one the paper form recorded by hand: the store takes
 * delivery, the HOD checks it against the indent, and writes "completed" on the
 * sheet. Until it is taken, an indent sits in APPROVED — which is not the same
 * as finished, and is exactly the gap the physical book was tracking.
 *
 * Approval is deliberately not the end of the line. An indent that was approved
 * three weeks ago and never arrived looks identical to one approved this morning
 * unless something records the difference, and "nobody chased it" is the failure
 * this stage is here to make visible.
 *
 * Who may do each is decided by rbac.ts, and that is the whole of the
 * authorisation. Approve and Complete additionally ask "are you sure", which is
 * a guard against the wrong button, not against the wrong person.
 *
 * CLOSED and its CLOSE event predate this — they were reserved in the database
 * enum for the purchase module and never issued. Completion is what they were
 * reserved for, so this needs no migration and old rows keep their meaning.
 */

export type WorkflowAction = 'submit' | 'approve' | 'reject' | 'complete';

export interface TransitionRule {
  action: WorkflowAction;
  from: IndentStatus[];
  to: IndentStatus;
  stage: EventStage;
  /** Label shown on the button that performs it. */
  label: string;
  /**
   * Whether performing it asks "are you sure" first.
   *
   * This was `requiresPassword`, and the password it referred to was a shared
   * secret — the whole authorisation control back when there was no sign-in and
   * anything else would have let any visitor approve a purchase. Real accounts
   * replaced it: the server now knows who is asking, and asking that person for
   * a second password everyone already shares adds nothing.
   *
   * A confirmation survives, on Approve only. Not as security — the permission
   * check is the security — but because Approve and Reject sit next to each
   * other, approving commits money, and it is the one of the two that cannot be
   * walked back by raising the indent again.
   */
  confirm: boolean;
  tone: 'primary' | 'neutral' | 'danger';
}

export const TRANSITIONS: TransitionRule[] = [
  {
    action: 'submit',
    from: ['DRAFT'],
    to: 'PENDING_APPROVAL',
    stage: 'SUBMIT',
    label: 'Submit Indent',
    confirm: false,
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
    confirm: true,
    tone: 'primary',
  },
  {
    action: 'reject',
    from: ['PENDING_APPROVAL', 'PENDING_PURCHASE', 'RETURNED'],
    to: 'REJECTED',
    stage: 'REJECT',
    label: 'Reject',
    /*
     * One click, no confirmation and no written reason.
     *
     * The asymmetry with Approve is deliberate rather than an oversight:
     * approving commits money, rejecting does not, and the person who raised
     * the indent can raise it again. What guards this is the indent:reject
     * permission — the button is only shown to, and only accepted from,
     * someone who holds it.
     */
    confirm: false,
    tone: 'danger',
  },
  {
    action: 'complete',
    /*
     * Only from APPROVED. Not from PENDING_APPROVAL, however obvious it may be
     * that the material arrived: an indent nobody authorised has no business
     * being closed as though it went through, and allowing it would leave a
     * finished indent with no approval anywhere in its history.
     */
    from: ['APPROVED'],
    to: 'CLOSED',
    stage: 'CLOSE',
    label: 'Mark completed',
    /*
     * Confirmed, for the same reason Approve is: there is no transition out of
     * CLOSED, so this is the second of the two one-way doors in the workflow.
     */
    confirm: true,
    tone: 'primary',
  },
];

/**
 * Which permission a person needs to perform an action, if any.
 *
 * Submitting needs none beyond being able to raise an indent at all: handing
 * one over is not an authorisation. The gate is on the two actions where money
 * starts moving.
 *
 * This used to name the two boolean columns on `people` directly. It now
 * returns an rbac permission, so the answer comes from one policy table rather
 * than from a field on a row — which is what lets a role grant approval without
 * every account being edited.
 */
export function requiredPermission(action: WorkflowAction): Permission | null {
  if (action === 'approve') return 'indent:approve';
  if (action === 'reject') return 'indent:reject';
  if (action === 'complete') return 'indent:complete';
  return null;
}

/** Everything this person is allowed to do to an indent in this state. */
export function allowedActions(
  status: IndentStatus,
  person: Principal | null,
): TransitionRule[] {
  return availableActions(status).filter((rule) => {
    const needed = requiredPermission(rule.action);
    if (!needed) return true;
    return can(person, needed);
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

/**
 * The line of guidance printed under a set of action buttons.
 *
 * Built from the buttons actually on screen rather than written out at each
 * call site. The sentence used to be a constant reading "Approving asks you to
 * confirm. Reject takes effect on the click" — true wherever it appeared while
 * those were the only two buttons, and wrong the moment an HOD sees a single
 * Mark completed button with no approval anywhere near it.
 */
export function actionHint(actions: TransitionRule[]): string | null {
  const has = (a: WorkflowAction) => actions.some((r) => r.action === a);
  const parts: string[] = [];

  if (has('approve') && has('reject')) {
    parts.push(
      'Approving asks you to confirm. Reject takes effect on the click, with no confirmation.',
    );
  } else if (has('approve')) {
    parts.push('Approving asks you to confirm, and cannot be undone.');
  } else if (has('reject')) {
    parts.push('Reject takes effect on the click, with no confirmation.');
  }

  if (has('complete')) {
    parts.push(
      'Mark completed once the material has reached the store and been checked — it closes the indent for good.',
    );
  }

  return parts.length > 0 ? parts.join(' ') : null;
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

/**
 * Approved, but the material has not been confirmed as received.
 *
 * The state nothing used to distinguish. An indent stays here from the moment
 * it is approved until somebody at the store says it arrived, which is where
 * the waiting actually happens and is the only stretch of the workflow the app
 * cannot shorten by itself.
 */
export function isAwaitingMaterial(status: IndentStatus): boolean {
  return status === 'APPROVED';
}

/** Finished: raised, approved, delivered and checked. */
export function isCompleted(status: IndentStatus): boolean {
  return status === 'CLOSED';
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<IndentStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Awaiting Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  /*
   * Not "Closed". The word on the paper form is "completed", written by hand by
   * whoever checked the delivery, and the screen should say what the people
   * using it say. "Closed" is the database's word for it, and it can stay there.
   */
  CLOSED: 'Completed',
  // Legacy states, kept so historical rows still render sensibly.
  PENDING_PURCHASE: 'Awaiting Approval',
  RETURNED: 'Awaiting Approval',
  CANCELLED: 'Withdrawn',
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
  CLOSE: 'Material received — completed',
  AMEND: 'Amended',
};
