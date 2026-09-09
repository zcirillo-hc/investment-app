import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'amber';
  size?: 'md' | 'lg' | 'sm';
  full?: boolean;
}

const variants = {
  primary: 'bg-leaf text-on-leaf hover:brightness-110 elev-1 active:shadow-none',
  secondary: 'bg-card text-ink ring-1 ring-line hover:bg-leaf-soft hover:ring-leaf/40',
  ghost: 'bg-transparent text-leaf hover:bg-leaf-soft',
  // C4-8: `text-ink` was right in light mode (5.4:1) and wrong in dark, where the ink is
  // near-white and the coral is light (2.06:1). The `on-*` tokens flip with the fill.
  danger: 'bg-coral text-on-coral hover:brightness-110 elev-1 active:shadow-none',
  amber: 'bg-amber text-on-amber hover:brightness-110 elev-1 active:shadow-none',
};
/**
 * The tap target floor, plan 6.13 and 11.2. It is a property of the size scale rather than of
 * any one call site: D7 came back a third time (test report V2-2) because `sm` was 36 px and
 * three screens happened to use it, and patching those three screens would have left the next
 * `size="sm"` to fail the same way. `sm` is now a smaller *typeface* and a tighter horizontal
 * pad, not a shorter button. `tests/unit/button-size.test.ts` asserts the floor over every
 * entry in this record, so a new size cannot be added below it.
 */
export const MIN_TAP_TARGET_PX = 44;

export const sizes = {
  sm: 'min-h-[44px] px-3.5 text-sm',
  md: 'min-h-[44px] px-4 text-base',
  lg: 'min-h-[52px] px-6 text-lg',
} as const;

/**
 * Visual polish pass, 2026-09-09: the press state is a real one now. `.press` scales by 2.5%
 * and drops the elevation on `:active`, so a tap reads as the control going down into the
 * surface rather than as a colour flicker. The scale is a transform, so nothing reflows.
 */
export function Button({ children, variant = 'primary', size = 'md', full = false, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      className={`press inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:ring-offset-ground ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
