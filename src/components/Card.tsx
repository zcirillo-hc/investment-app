import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: 'default' | 'leaf' | 'coral' | 'amber' | 'sunken';
  padded?: boolean;
  /** Elevation step. `flat` is for a card that sits inside another card. */
  elevation?: 'flat' | 'low' | 'high';
  /** Adds the hover lift and press settle. Only for a card that is itself a link or a button. */
  interactive?: boolean;
}

/**
 * Visual polish pass, 2026-09-09.
 *
 * The tones are solid colours on purpose. Depth comes from the elevation tokens in
 * `index.css` plus a hairline ring, never from a gradient, because a gradient in the stack
 * under a text node turns an axe contrast pass into an "incomplete" result. Illustration is
 * where the gradients live.
 */
const tones = {
  default: 'bg-card',
  leaf: 'bg-leaf-soft',
  coral: 'bg-coral-soft',
  amber: 'bg-amber-soft',
  sunken: 'bg-ground',
};

const elevations = { flat: '', low: 'elev-1', high: 'elev-2' };

export function Card({ children, tone = 'default', padded = true, elevation = 'low', interactive = false, className = '', ...rest }: Props) {
  return (
    <div
      className={`rounded-card ring-1 ring-line/70 ${elevations[elevation]} ${tones[tone]} ${interactive ? 'lift' : ''} ${padded ? 'p-4 sm:p-5' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
