'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  Settings,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { Person } from '@/db/schema';
import { ActingAs } from '@/components/acting-as';
import { cn } from '@/components/ui';

/*
 * The shell: sidebar, top bar on phones, bottom bar on phones.
 *
 * Every route is open — no sign-in, no roles, nothing hidden. The only identity
 * in the app is the "acting as" name, which decides whose name is stamped on
 * the next action and printed in the signature box.
 *
 * `children` arrives already rendered on the server. This component is a client
 * component only because the sidebar collapses and the active link has to be
 * derived from the current path; the pages inside it stay server components.
 */

const NAV = [
  { href: '/indents', label: 'Indents', short: 'Indents', icon: ClipboardList },
  { href: '/admin', label: 'Settings', short: 'Settings', icon: Settings },
];

/** The company monogram. A tile, not a wordmark — it survives being 32px wide. */
function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold tracking-tight text-primary-ink',
        className,
      )}
    >
      MQ
    </span>
  );
}

export function AppShell({
  people,
  actor,
  defaultCollapsed,
  children,
}: {
  people: Person[];
  actor: Person | null;
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
          <Logo />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-ink">
                Purchase Indent
              </p>
              <p className="truncate text-xs leading-tight text-muted">
                Marudhar Quartz
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
          {NAV.map((item) => {
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
              <div className="rounded-xl border border-line bg-sunken p-3">
                <p className="eyebrow">Acting as</p>
                <div className="mt-2">
                  <ActingAs people={people} current={actor} />
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
                  No sign-in. This name is stamped on whatever you do next.
                </p>
              </div>
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
            <Logo className="h-8 w-8 text-xs" />
            <p className="truncate text-sm font-semibold text-ink">Purchase Indent</p>
          </div>
          <ActingAs people={people} current={actor} />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>

        {/* Phones: thumb-reachable navigation. Indents get raised standing on a
            plant floor, not at a desk. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAV.map((item) => {
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
