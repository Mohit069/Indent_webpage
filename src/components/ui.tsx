import Link from 'next/link';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { IndentStatus, Priority } from '@/db/schema';
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/workflow';

/*
 * The design system.
 *
 * Every screen is assembled from what is in this file, so spacing, radii,
 * focus rings and control heights cannot drift page by page. If something
 * looks inconsistent, the fix belongs here rather than in the page.
 *
 * Conventions follow shadcn/ui — `cn()` over clsx + tailwind-merge, variants
 * as lookup maps, `className` always merged last so a caller can override —
 * without taking the dependency. These components wrap plain HTML elements
 * because the forms are server-action driven and must keep working with
 * JavaScript disabled; a Radix-portalled control would break that.
 */

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Card header: a title, optional supporting line, optional right-hand action. */
export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Kept as the thin alias the older pages import. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return <CardHeader title={children} action={action} />;
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

/** A quiet closing note under a card — provenance, caveats, counts. */
export function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-faint">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-faint" aria-hidden />}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="rounded px-1 py-0.5 font-medium transition-colors hover:text-ink"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="px-1 py-0.5 font-medium text-ink" aria-current="page">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  badge,
  breadcrumbs,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
  primary: 'bg-blue-50 text-blue-700 ring-blue-200',
  success: 'bg-green-50 text-green-700 ring-green-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A small filled circle carrying the tone, so status is not colour-of-text alone. */
function Dot({ className }: { className?: string }) {
  return (
    <span
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', className)}
      aria-hidden
    />
  );
}

const STATUS_DOTS: Record<IndentStatus, string> = {
  DRAFT: 'bg-gray-400',
  PENDING_APPROVAL: 'bg-amber-500',
  PENDING_PURCHASE: 'bg-amber-500',
  RETURNED: 'bg-amber-500',
  APPROVED: 'bg-green-600',
  REJECTED: 'bg-red-600',
  CANCELLED: 'bg-gray-400',
  CLOSED: 'bg-teal-600',
};

/** State encoded in colour, a dot and text, so a queue reads at a glance. */
export function StatusChip({
  status,
  className,
}: {
  status: IndentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        STATUS_STYLES[status],
        className,
      )}
    >
      <Dot className={STATUS_DOTS[status]} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/*
 * How soon the material is needed.
 *
 * Two wordings for one value: the full deadline where there is room to read it,
 * and the level alone in a table column where there is not. The full wording is
 * the one that appears on the form, because that is where the commitment is
 * being made.
 */
export const PRIORITY_LABELS: Record<Priority, string> = {
  ASAP: 'ASAP',
  LEVEL_1: 'Level 1 — within a week',
  LEVEL_2: 'Level 2 — within 2 weeks',
  LEVEL_3: 'Level 3 — within 3 weeks',
};

export const PRIORITY_SHORT: Record<Priority, string> = {
  ASAP: 'ASAP',
  LEVEL_1: 'Level 1',
  LEVEL_2: 'Level 2',
  LEVEL_3: 'Level 3',
};

/** Descending urgency — the order they are offered in, and read in. */
export const PRIORITY_ORDER: Priority[] = ['ASAP', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

const PRIORITY_TONES: Record<Priority, BadgeTone> = {
  ASAP: 'danger',
  LEVEL_1: 'warning',
  LEVEL_2: 'info',
  LEVEL_3: 'neutral',
};

const PRIORITY_DOTS: Record<Priority, string> = {
  ASAP: 'bg-red-600',
  LEVEL_1: 'bg-amber-500',
  LEVEL_2: 'bg-sky-500',
  LEVEL_3: 'bg-gray-400',
};

/**
 * Priority as a badge rather than as bare text.
 *
 * The least urgent level is shown too, in neutral grey. Leaving it blank made
 * an unfilled cell ambiguous — nobody could tell "not urgent" from "the person
 * forgot".
 */
export function PriorityMark({
  priority,
  variant = 'short',
  className,
}: {
  priority: Priority;
  /** `full` spells out the deadline; `short` gives the level alone. */
  variant?: 'short' | 'full';
  className?: string;
}) {
  return (
    <Badge tone={PRIORITY_TONES[priority]} className={className}>
      <Dot className={PRIORITY_DOTS[priority]} />
      {variant === 'full' ? PRIORITY_LABELS[priority] : PRIORITY_SHORT[priority]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger' | 'neutral';
export type ButtonSize = 'sm' | 'md' | 'lg';

/*
 * `neutral` is an alias for `secondary`, kept because older callers use it.
 * Both render the white-with-border button.
 */
const BUTTON_TONES: Record<ButtonTone, string> = {
  primary:
    'bg-primary text-primary-ink shadow-[var(--shadow-card)] hover:bg-primary-hover active:bg-primary-hover',
  secondary:
    'border border-line-strong bg-surface text-ink hover:bg-raised active:bg-raised',
  neutral:
    'border border-line-strong bg-surface text-ink hover:bg-raised active:bg-raised',
  ghost: 'text-muted hover:bg-raised hover:text-ink active:bg-raised',
  danger:
    'bg-danger text-white shadow-[var(--shadow-card)] hover:bg-danger-hover active:bg-danger-hover',
};

/** 44px is the default target; `sm` exists only for dense table rows. */
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-lg px-3 text-xs',
  md: 'h-11 gap-2 rounded-lg px-4 text-sm',
  lg: 'h-12 gap-2 rounded-lg px-5 text-sm',
};

export const buttonClass = (
  tone: ButtonTone = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) =>
  cn(
    'inline-flex select-none items-center justify-center font-medium whitespace-nowrap',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-150',
    'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50',
    BUTTON_SIZES[size],
    BUTTON_TONES[tone],
    className,
  );

export function Button({
  tone = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
}) {
  return <button {...props} className={buttonClass(tone, size, className)} />;
}

/** A link that looks like a button. Separate so navigation stays an anchor. */
export function ButtonLink({
  href,
  tone = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & {
  tone?: ButtonTone;
  size?: ButtonSize;
}) {
  return (
    <Link href={href} {...props} className={buttonClass(tone, size, className)}>
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  tone = 'ghost',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: ButtonTone;
}) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
        tone === 'danger'
          ? 'text-faint hover:bg-danger-soft hover:text-danger'
          : 'text-faint hover:bg-raised hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

/*
 * One control height across the app (44px), one radius, one focus treatment.
 * The focus state is a ring rather than an outline so it sits flush against
 * the border instead of jumping the layout.
 */
const CONTROL_BASE =
  'w-full rounded-lg border border-line-strong bg-surface text-sm text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-faint hover:border-gray-400 focus:border-primary focus:ring-2 focus:ring-[var(--primary-soft)] focus:outline-none disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted';

export const inputClass = cn(CONTROL_BASE, 'h-11 px-3.5');
export const textareaClass = cn(CONTROL_BASE, 'min-h-24 px-3.5 py-3 leading-relaxed');
export const selectClass = cn(CONTROL_BASE, 'select-reset h-11 cursor-pointer pl-3.5 pr-10');

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(textareaClass, className)} />;
}

/**
 * A native select with our own chevron.
 *
 * Native on purpose: it is the control every phone and screen reader already
 * knows, it works without JavaScript, and on the plant floor a real OS picker
 * beats a custom listbox. Only the arrow is replaced, so it matches the rest.
 */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn(selectClass, className)}>
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
      />
    </div>
  );
}

export function Label({
  children,
  required,
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label {...props} className={cn('text-sm font-medium text-ink', className)}>
      {children}
      {required && (
        <span className="ml-0.5 text-danger" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

/**
 * Label, control, then either a hint or an error — never both, because the
 * error is what needs reading and the hint has already been read.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs leading-relaxed text-muted">{hint}</span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Alert({
  tone = 'danger',
  title,
  children,
  className,
}: {
  tone?: 'danger' | 'warning' | 'success' | 'info';
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    danger: 'border-red-200 bg-danger-soft text-red-900',
    warning: 'border-amber-200 bg-warning-soft text-amber-900',
    success: 'border-green-200 bg-success-soft text-green-900',
    info: 'border-blue-200 bg-primary-soft text-blue-900',
  } as const;

  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border px-4 py-3 text-sm leading-relaxed',
        tones[tone],
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-faint">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">
          {message}
        </p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** A summary tile. Count first, label under it — these are scanned, not read. */
export function StatTile({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span
        className={cn(
          'tabular mt-2 text-2xl font-semibold leading-none',
          accent && value > 0 ? 'text-primary' : 'text-ink',
        )}
      >
        {value}
      </span>
    </>
  );

  const classes =
    'flex flex-col rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow,background-color] duration-150';

  if (href) {
    return (
      <Link
        href={href}
        className={cn(classes, 'hover:border-line-strong hover:shadow-[var(--shadow-raised)]')}
      >
        {inner}
      </Link>
    );
  }
  return <div className={classes}>{inner}</div>;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/*
 * Tables are plain elements with shared classes rather than components: the
 * columns differ enough per screen that a generic <DataTable> would be all
 * config and no clarity.
 */
export const tableWrapClass = 'overflow-x-auto';
export const tableClass = 'w-full text-sm';
export const theadClass =
  'sticky top-0 z-10 bg-sunken text-left [&_th]:border-b [&_th]:border-line';
export const thClass = 'px-5 py-3 text-xs font-medium text-muted whitespace-nowrap';
export const trClass =
  'border-b border-line last:border-0 transition-colors duration-100 hover:bg-raised';
export const tdClass = 'px-5 py-3.5 align-middle';
