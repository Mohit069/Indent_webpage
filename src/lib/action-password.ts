import { timingSafeEqual } from 'node:crypto';

/*
 * The shared password on Approve and Reject.
 *
 * There are no accounts, so this is the whole of the authorisation control: it
 * separates "anyone who can open the page" from "anyone allowed to authorise a
 * purchase". It identifies nobody — the name on the record still comes from
 * whoever this computer is set to.
 *
 * Set ACTION_PASSWORD in the environment. There is deliberately no fallback
 * value in this file: a default baked into the source is published the moment
 * the repository is, and a password anyone can read in a public repo is not a
 * control at all. Refusing to start is the honest failure — an app whose only
 * authorisation gate is unset should not be answering requests.
 *
 * Changing it needs a restart, not a redeploy.
 *
 * ------------------------------------------------------------------------
 * THIS MODULE MUST NEVER BE IMPORTED FROM A CLIENT COMPONENT.
 *
 * It reads a secret from the environment, and a client import would ship that
 * read into the browser bundle. It is deliberately not marked `server-only`:
 * that guard would also stop the test suite from exercising the real
 * comparison, and an untested gate is worse than an unguarded import. The rule
 * is enforced instead by a check in scripts/verify.ts that scans every
 * 'use client' file for an import of this module.
 * ------------------------------------------------------------------------
 */

export function actionPassword(): string {
  const configured = process.env.ACTION_PASSWORD;

  if (!configured) {
    throw new Error(
      'ACTION_PASSWORD is not set. Approve and Reject are gated by it, so the ' +
        'app will not authorise anything until it has a value. Set it in .env ' +
        'locally, or in the host’s environment variables when deployed.',
    );
  }

  return configured;
}

/**
 * Compared in constant time.
 *
 * Overkill for a password shared by three people on an office LAN, but it costs
 * nothing and means a byte-by-byte timing difference never becomes the reason
 * this leaks.
 */
export function checkActionPassword(supplied: string): boolean {
  const expected = actionPassword();
  const a = Buffer.from(String(supplied ?? ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');

  // timingSafeEqual throws on length mismatch, so equalise first — the length
  // itself is not the secret here.
  if (a.length !== b.length) {
    // Still burn a comparison so the failure path costs roughly the same.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
