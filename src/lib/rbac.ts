import type { UserRole } from '@/db/schema';

/*
 * Who may do what.
 *
 * One table, `ROLE_PERMISSIONS`, is the entire policy. Nothing else in the
 * application decides a permission — pages, actions and navigation all ask
 * `can()`. Adding a fourth role is one entry here; it is not a migration and it
 * is not a search for every `if (role === …)` in the codebase, because there
 * are none.
 *
 * No email is special-cased. Saurabh is seeded as the first SUPER_ADMIN, but
 * that is a row, and a second Super Admin can be appointed from the Users
 * screen without a deploy.
 *
 * This file is deliberately pure — no database, no `server-only`. It runs the
 * same on the server, where it is the actual gate, and in a client component
 * deciding whether to render a button. Those two must never be able to
 * disagree, which is why there is one implementation rather than two.
 */

export type Permission =
  // Indents
  | 'indent:create'
  | 'indent:submit'
  | 'indent:view:own'
  | 'indent:view:all'
  | 'indent:approve'
  | 'indent:reject'
  /*
   * Marking an approved indent finished, once the material has actually arrived
   * and been checked at the store.
   *
   * Separate from `indent:approve` on purpose, because it answers a different
   * question and is answered by a different person: approval is "should we buy
   * this", completion is "did we get it". The HOD who raised it is the one
   * standing in front of the delivery, so it is theirs — it is the only thing
   * they may do to an indent after submitting it.
   */
  | 'indent:complete'
  // Administration
  | 'user:manage'
  | 'department:manage'
  | 'masters:manage'
  | 'report:view'
  // Purchase side. The screens are not built yet; the permissions are, so the
  // role exists in full the day the module lands.
  | 'po:create'
  | 'po:update'
  | 'material:receive';

/**
 * The policy.
 *
 * Read it as the answer to "what is this job allowed to touch". The gaps are as
 * deliberate as the entries: an HOD has no `indent:approve` because the whole
 * point of the approval structure is that raising a request and authorising it
 * are different people.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: [
    'indent:create',
    'indent:submit',
    'indent:view:own',
    'indent:view:all',
    'indent:approve',
    'indent:reject',
    'indent:complete',
    'user:manage',
    'department:manage',
    'masters:manage',
    'report:view',
    'po:create',
    'po:update',
    'material:receive',
  ],
  HOD: [
    'indent:create',
    'indent:submit',
    'indent:view:own',
    // The receiving end: confirming the material turned up. Granted here and
    // not `indent:approve`, which is the whole point of the split — an HOD may
    // say "this arrived", never "this may be bought".
    'indent:complete',
    // Explicitly absent: approve, reject, and any sight of another
    // department's indents.
  ],
  PURCHASE: [
    'indent:view:all',
    'po:create',
    'po:update',
    'material:receive',
    'report:view',
  ],
};

/**
 * The shape `can()` needs. A structural type rather than the full `Person`, so
 * that a client component can be handed the three fields that matter instead of
 * a row containing a password hash.
 */
export interface Principal {
  role: UserRole;
  canApprove: boolean;
  canReject: boolean;
}

/** Narrow a person down to what a permission check actually reads. Use this
 *  before passing anyone across the server/client boundary. */
export function toPrincipal(person: Principal): Principal {
  return {
    role: person.role,
    canApprove: person.canApprove,
    canReject: person.canReject,
  };
}

/**
 * Everything this person may do.
 *
 * The role's set, plus the two per-person grants. Additive only: the flags can
 * hand an extra power to one individual — say, a plant head who deputises while
 * Saurabh is away — but clearing one can never take away something the role
 * confers, so a Super Admin cannot be quietly defanged by unticking a box.
 */
export function permissionsFor(person: Principal | null): Set<Permission> {
  if (!person) return new Set();

  const granted = new Set<Permission>(ROLE_PERMISSIONS[person.role] ?? []);
  if (person.canApprove) granted.add('indent:approve');
  if (person.canReject) granted.add('indent:reject');

  return granted;
}

/** The one question the rest of the application asks. */
export function can(person: Principal | null, permission: Permission): boolean {
  return permissionsFor(person).has(permission);
}

/** True if the person holds at least one of these. For navigation, where a
 *  section is worth showing if any page inside it is reachable. */
export function canAny(person: Principal | null, permissions: Permission[]): boolean {
  const granted = permissionsFor(person);
  return permissions.some((p) => granted.has(p));
}

export function isSuperAdmin(person: Principal | null): boolean {
  return person?.role === 'SUPER_ADMIN';
}

/**
 * How much of the indent list this person may see.
 *
 * Returned as an instruction to the query layer rather than as a boolean, so
 * that scoping is decided once, here, and every list obeys the same rule.
 *
 *   all   — Super Admin and Purchase: the whole company
 *   own   — HOD: the indents they raised, and nothing from other departments
 *   none  — signed out
 */
export type IndentScope = 'all' | 'own' | 'none';

export function indentScopeFor(person: Principal | null): IndentScope {
  if (!person) return 'none';
  if (can(person, 'indent:view:all')) return 'all';
  if (can(person, 'indent:view:own')) return 'own';
  return 'none';
}

/**
 * Thrown when an action is attempted without the permission for it.
 *
 * A distinct class so callers can tell "you may not" apart from "that went
 * wrong", and turn the first into a 403 page rather than a 500.
 */
export class PermissionError extends Error {
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = 'PermissionError';
    this.permission = permission;
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  HOD: 'Head of Department',
  PURCHASE: 'Purchase Team',
};

/** One line describing what a role is for, shown next to the picker on the
 *  Users screen so nobody has to guess what they are granting. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Approves and rejects indents, manages users and departments, sees everything.',
  HOD: 'Raises indents for their department, tracks them, and marks them completed once the material arrives. Cannot approve.',
  PURCHASE: 'Sees approved indents and handles purchase orders. Cannot approve.',
};
