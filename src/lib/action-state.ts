/*
 * What a form action hands back.
 *
 * `ok` exists because the absence of errors is NOT the same as success.
 * `useActionState` starts every form at `{}` — no error, no field errors — which
 * is indistinguishable from a completed run unless success is stated outright.
 * Reading "no errors" as "it worked" closed the approve dialog the instant it
 * opened.
 */
export interface ActionResult {
  /** Set only when the action actually completed and changed something. */
  ok?: true;
  /** A message about the whole form. */
  error?: string;
  /** Messages keyed by field name. */
  fieldErrors?: Record<string, string>;
}

/**
 * Whether a dialog holding this form should close.
 *
 * Pure and exported so it can be tested — the bug it guards against is a
 * one-character mistake that no amount of page-render testing would catch.
 */
export function shouldCloseAfter(state: ActionResult | undefined): boolean {
  return state?.ok === true;
}
