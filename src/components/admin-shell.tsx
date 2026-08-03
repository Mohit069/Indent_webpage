'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import { can, type Permission, type Principal } from '@/lib/rbac';
import { UserBadge, type BadgeUser } from '@/components/user-badge';
import { BrandMark, BrandWordmark } from '@/components/brand';
import { cn } from '@/components/ui';

/*
 * The Super Admin's shell.
 *
 * Separate from AppShell rather than a variant of it. The two have different
 * jobs — one is for raising indents, the other for deciding and administering
 * them — and a single component with a `variant` prop would grow a conditional
 * around every element in it. They share the primitives and the UserBadge,
 * which is the part worth sharing.
 *
 * The badge on Pending Approvals is the notification requirement: a count of
 * what is waiting, computed on the server and passed down.
 */

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  /** Matched exactly rather than by prefix. Without this, /admin would light up
   *  on every page beneath it. */
  exact?: boolean;
  badge?: number;
}

export function AdminShell({
  user,
  principal,
  pendingCount,
  defaultCollapsed,
  children,
}: {
  user: BadgeUser;
  principal: Principal;
  pendingCount: number;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();

  /*
   * Annotated before `.filter`, not after. Annotating the result lets the array
   * literal infer its own type first, which widens `permission` to `string` and
   * loses the check that every one of them is a real Permission.
   */
  const allNav: NavItem[] = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    {
      href: '/admin/pending',
      label: 'Pending Approvals',
      icon: ClipboardCheck,
      badge: pendingCount,
    },
    { href: '/admin/indents', label: 'All Indents', icon: ClipboardList },
    { href: '/admin/users', label: 'Users', icon: Users, permission: 'user:manage' },
    {
      href: '/admin/departments',
      label: 'Departments',
      icon: Building2,
      permission: 'department:manage',
    },
    { href: '/admin/reports', label: 'Reports', icon: BarChart3, permission: 'report:view' },
    {
      href: '/admin/masters/items',
      label: 'Master Data',
      icon: Settings,
      permission: 'masters:manage',
    },
  ];

  const nav = allNav.filter((item) => !item.permission || can(principal, item.permission));

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div
      className={cn(
        'min-h-dvh lg:grid',
        collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[16rem_1fr]',
      )}
    >
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col">
        <div
          className={cn(
            'flex h-16 items-center gap-2.5 border-b border-line',
            collapsed ? 'justify-center px-3' : 'px-5',
          )}
        >
          {collapsed ? (
            <BrandMark />
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <BrandWordmark width={124} />
              <p className="truncate pl-0.5 text-[11px] leading-tight text-muted">
                Administration
              </p>
            </div>
          )}
        </div>

        {/*
         * A way back into the requester's app.
         *
         * Without this the admin area is a dead end: the policy grants a Super
         * Admin `indent:create`, but every link in this sidebar points at
         * /admin/*, so there was no route to the form at all — the permission
         * existed and could not be used. Gated on the permission rather than on
         * the role, so removing indent:create from SUPER_ADMIN in rbac.ts is all
         * it takes to enforce "only HODs raise indents".
         */}
        {can(principal, 'indent:create') && (
          <div className="px-3 pt-4">
            <Link
              href="/indents/new"
              title={collapsed ? 'New Indent' : undefined}
              className={cn(
                'flex h-11 items-center rounded-lg bg-primary font-medium text-primary-ink shadow-[var(--shadow-card)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.985]',
                collapsed ? 'justify-center px-0' : 'gap-2 px-3.5 text-sm',
              )}
            >
              <Plus size={18} aria-hidden />
              {!collapsed && 'New Indent'}
            </Link>
            {!collapsed && (
              <Link
                href="/indents"
                className="mt-2 flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <ClipboardList size={15} aria-hidden />
                Requester view
              </Link>
            )}
          </div>
        )}

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center rounded-lg text-sm font-medium transition-colors duration-150',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                  active
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted hover:bg-raised hover:text-ink',
                )}
              >
                <item.icon
                  size={18}
                  aria-hidden
                  className={active ? 'text-primary' : 'text-faint'}
                />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {/* Zero is not shown. A badge reading "0" is noise that trains
                    people to stop looking at the badge. */}
                {item.badge ? (
                  <span
                    className={cn(
                      'flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                      collapsed
                        ? 'absolute ml-7 -mt-5 h-4 bg-danger text-white'
                        : 'h-5 bg-danger text-white',
                    )}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <UserBadge user={user} compact />
              <button
                type="button"
                onClick={toggle}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-ink"
              >
                <PanelLeftOpen size={18} aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <UserBadge user={user} />
              <button
                type="button"
                onClick={toggle}
                className="mt-2 flex h-9 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <PanelLeftClose size={16} aria-hidden />
                Collapse
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandWordmark width={96} className="px-2 py-1.5" />
            <p className="truncate text-sm font-medium text-muted">Administration</p>
          </div>
          <UserBadge user={user} compact />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>

        {/*
         * Phones — and, just as often, a laptop with devtools docked. The
         * sidebar disappears below 1024px, so anything only in the sidebar is
         * simply gone at 986px wide. The three most-used links plus New.
         */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          {nav.slice(0, 3).map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                <item.icon size={20} aria-hidden />
                {item.badge ? (
                  <span className="absolute right-1/2 top-1.5 -mr-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
                <span className="truncate px-1">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}

          {can(principal, 'indent:create') && (
            <Link
              href="/indents/new"
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-primary"
            >
              <Plus size={20} aria-hidden />
              New
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
