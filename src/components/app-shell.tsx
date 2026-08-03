'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  LayoutDashboard,
  Settings,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { can, type Permission, type Principal } from '@/lib/rbac';
import { UserBadge, type BadgeUser } from '@/components/user-badge';
import { BrandMark, BrandWordmark } from '@/components/brand';
import { cn } from '@/components/ui';

/*
 * The shell: sidebar, top bar on phones, bottom bar on phones.
 *
 * This is the requester's view — where an HOD raises and tracks indents. The
 * Super Admin has a separate shell under /admin, because the brief is explicit
 * that Saurabh should not land in the HOD interface.
 *
 * Navigation is filtered by permission, but filtering it is a courtesy: it
 * keeps people from walking into a page that will refuse them. It is not the
 * control. Every route behind these links checks for itself, because a link
 * that is not rendered is still a URL anyone can type.
 *
 * `children` arrives already rendered on the server. This component is a client
 * component only because the sidebar collapses and the active link has to be
 * derived from the current path; the pages inside it stay server components.
 */

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: typeof ClipboardList;
  /** Omitted means everyone signed in may see it. */
  permission?: Permission;
}

const NAV: NavItem[] = [
  { href: '/indents', label: 'Indents', short: 'Indents', icon: ClipboardList },
  {
    href: '/admin',
    label: 'Admin',
    short: 'Admin',
    icon: LayoutDashboard,
    permission: 'user:manage',
  },
  {
    href: '/admin/masters/items',
    label: 'Master data',
    short: 'Masters',
    icon: Settings,
    permission: 'masters:manage',
  },
];

export function AppShell({
  user,
  principal,
  defaultCollapsed,
  children,
}: {
  user: BadgeUser;
  /** Only the three fields a permission check reads — never the whole row,
   *  which carries a password hash across to the client. */
  principal: Principal;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  /*
   * Seeded from a cookie the server already read, so the sidebar renders at its
   * remembered width on the very first paint. Reading localStorage after mount
   * would render wide and then snap narrow on every page load.
   */
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();

  const nav = NAV.filter((item) => !item.permission || can(principal, item.permission));

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // A year, path-wide. It is a display preference, so nothing here is sensitive.
    document.cookie = `sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div
      className={cn(
        'min-h-dvh lg:grid',
        collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[16rem_1fr]',
      )}
    >
      {/* ---------------------------------------------------------------- */}
      {/* Sidebar (desktop)                                                 */}
      {/* ---------------------------------------------------------------- */}
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
                Purchase Indent
              </p>
            </div>
          )}
        </div>

        <div className={cn('pt-4', collapsed ? 'px-3' : 'px-3')}>
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
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = isActive(item.href);
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
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          {collapsed ? (
            <div className="flex justify-center">
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

      {/* ---------------------------------------------------------------- */}
      {/* Content                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandWordmark width={96} className="px-2 py-1.5" />
            <p className="truncate text-sm font-medium text-muted">Purchase Indent</p>
          </div>
          <UserBadge user={user} compact />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>

        {/* Phones: thumb-reachable navigation. Indents get raised standing on a
            plant floor, not at a desk. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                <item.icon size={20} aria-hidden />
                {item.short}
              </Link>
            );
          })}
          <Link
            href="/indents/new"
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-primary"
          >
            <Plus size={20} aria-hidden />
            New
          </Link>
        </nav>
      </div>
    </div>
  );
}
