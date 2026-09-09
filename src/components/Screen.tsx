import type { ReactNode } from 'react';

/**
 * Root wrapper every screen uses: gives the data-testid and consistent padding.
 *
 * Visual polish pass, 2026-09-09: it also carries the screen entrance, a 300 ms fade and a
 * 10 px rise. One element moves, not each card, because a per-card stagger on a whole screen
 * shifts every control's box for a third of a second and the standalone checks measure boxes.
 * The movement is vertical only: a horizontal transform on a full width element can widen the
 * document mid-animation, which is the thing the no-horizontal-scroll check exists to catch.
 */
export function Screen({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return (
    <main data-testid={`screen-${id}`} className={`rise mx-auto w-full max-w-content px-4 pb-6 pt-2 sm:px-6 ${className}`}>
      {children}
    </main>
  );
}

/**
 * The standard screen heading. Every v2 screen wrote its own `h1` plus a muted paragraph with
 * slightly different spacing; this is that pattern, once, with room for an eyebrow line.
 */
export function ScreenTitle({ title, sub, eyebrow }: { title: string; sub?: ReactNode; eyebrow?: string }) {
  return (
    <div className="pt-1">
      {eyebrow && <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{eyebrow}</div>}
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-3xl">{title}</h1>
      {sub && <p className="mt-1 text-[15px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}
