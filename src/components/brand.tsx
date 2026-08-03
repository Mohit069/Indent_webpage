import { cn } from '@/components/ui';

/*
 * The Artizia wordmark.
 *
 * The logo is a gold gradient running from bronze on the left to a very pale
 * champagne on the right, and the app's surfaces are white (--surface #ffffff).
 * Placed straight onto them, the right-hand half of "ARTIZIA" — and most of
 * "QUARTZ MASTERPIECES", which is the palest part of the artwork — drops to
 * almost nothing. So the wordmark sits on a dark plate, which is how the brand
 * presents it anyway.
 *
 * The asset is 444×110, a shade over 4:1. That ratio is why there are two
 * components rather than one: at the 72px the sidebar collapses to, a 4:1
 * wordmark is 18px tall and unreadable, so the collapsed rail gets a monogram
 * instead of a squeezed logo.
 */

const LOGO_SRC = '/artizia-logo.webp';

/**
 * The full wordmark on its plate.
 *
 * Width is set and height left to follow, so the intrinsic ratio holds and
 * nothing shifts as the image loads. `alt` carries the company name because
 * this is the only place a screen reader is told whose system this is.
 */
export function BrandWordmark({
  width = 132,
  className,
}: {
  width?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg bg-ink px-3 py-2',
        className,
      )}
    >
      {/*
        A plain <img>, not next/image. The file is 10.7 KB and fixed-size, so
        there is nothing for the optimiser to do — and on Vercel every optimised
        image is metered, which is a strange thing to spend on a logo that never
        changes.
      */}
      <img
        src={LOGO_SRC}
        alt="Artizia Quartz"
        width={width}
        height={Math.round((width * 110) / 444)}
        className="block h-auto w-full"
      />
    </span>
  );
}

/**
 * The square monogram, for the collapsed rail and anywhere else too narrow for
 * the wordmark.
 *
 * Drawn rather than cropped from the artwork: cropping the "A" out of a 444×110
 * image gives a letter clipped at the baseline. The gradient stops are sampled
 * from the logo — bronze, gold, champagne — so the two read as the same brand
 * sitting next to each other.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink',
        className,
      )}
    >
      <span
        className="bg-gradient-to-br from-[#8C6B1E] via-[#D9B44A] to-[#F5E7B2] bg-clip-text text-[15px] font-semibold tracking-[0.08em] text-transparent"
        style={{ fontFamily: 'var(--font-geist-sans, ui-sans-serif, system-ui)' }}
      >
        A
      </span>
    </span>
  );
}
