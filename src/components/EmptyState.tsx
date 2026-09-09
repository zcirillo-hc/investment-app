import type { ReactNode } from 'react';

/**
 * Visual polish pass, 2026-09-09.
 *
 * A new user meets mostly empty screens, and before this pass each of them said a version of
 * "nothing here" in a bare card. An empty state is the screen at its most explanatory moment,
 * so each one now carries a spot illustration, a warm line, and a pointer at the next action.
 *
 * The illustrations are inline SVG (no icon package, per the bundle constraint) and they are
 * the one place a gradient is allowed: nothing here has text sitting on top of it, so no axe
 * contrast check ever has to resolve a colour through them.
 */
export type SpotName = 'places' | 'invest' | 'activity' | 'milestone' | 'jar' | 'muted';

function Spot({ name }: { name: SpotName }) {
  const common = { width: '100%', height: '100%', viewBox: '0 0 120 120', 'aria-hidden': true as const };
  switch (name) {
    case 'places':
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="spot-places" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="text-leaf-soft" stopColor="currentColor" />
              <stop offset="1" className="text-card" stopColor="currentColor" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="46" fill="url(#spot-places)" />
          <path d="M60 30c-10 0-18 8-18 18 0 13 18 32 18 32s18-19 18-32c0-10-8-18-18-18z" className="fill-leaf" />
          <circle cx="60" cy="48" r="6.5" className="fill-card" />
          <circle cx="34" cy="84" r="4" className="fill-coral" />
          <circle cx="86" cy="76" r="3" className="fill-amber" />
          <path d="M30 92c14 6 46 6 60 0" className="stroke-leaf" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" strokeDasharray="2 7" />
        </svg>
      );
    case 'invest':
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="spot-invest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="text-leaf-soft" stopColor="currentColor" />
              <stop offset="1" className="text-card" stopColor="currentColor" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="46" fill="url(#spot-invest)" />
          <rect x="30" y="74" width="60" height="12" rx="6" className="fill-leaf" />
          <rect x="36" y="60" width="48" height="12" rx="6" className="fill-leaf" opacity="0.75" />
          <rect x="43" y="46" width="34" height="12" rx="6" className="fill-amber" />
          <circle cx="78" cy="36" r="7" className="fill-coral" />
          <path d="M75 36h6M78 33v6" className="stroke-on-coral" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="46" className="fill-leaf-soft" />
          <rect x="34" y="42" width="52" height="10" rx="5" className="fill-card" />
          <rect x="34" y="58" width="40" height="10" rx="5" className="fill-card" opacity="0.8" />
          <rect x="34" y="74" width="30" height="10" rx="5" className="fill-card" opacity="0.6" />
          <circle cx="82" cy="79" r="7" className="fill-coral" />
        </svg>
      );
    case 'milestone':
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="46" className="fill-leaf-soft" />
          <path d="M60 32l7.6 15.8 17.4 2.4-12.7 12 3.1 17.2L60 71.4 44.6 79.4l3.1-17.2-12.7-12 17.4-2.4z" className="fill-amber" />
          <circle cx="60" cy="60" r="7" className="fill-card" />
        </svg>
      );
    case 'muted':
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="46" className="fill-leaf-soft" />
          <path d="M52 50h-9v20h9l14 11V39z" className="fill-leaf" />
          <path d="M74 52l14 16M88 52l-14 16" className="stroke-coral" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case 'jar':
    default:
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="46" className="fill-leaf-soft" />
          <rect x="48" y="30" width="24" height="9" rx="4" className="fill-leaf" />
          <rect x="40" y="40" width="40" height="46" rx="12" className="fill-card stroke-leaf" strokeWidth="4" />
          <rect x="45" y="66" width="30" height="15" rx="7" className="fill-coral" />
        </svg>
      );
  }
}

interface Props {
  spot: SpotName;
  title: string;
  body: string;
  /** The next action. Rendered under the copy, centred with the rest. */
  action?: ReactNode;
  testId?: string;
  /** A second test id, on the body line. Some screens are asserted at both levels. */
  bodyTestId?: string;
  className?: string;
}

export function EmptyState({ spot, title, body, action, testId, bodyTestId, className = '' }: Props) {
  return (
    <div
      data-testid={testId}
      className={`rounded-card bg-card px-5 py-8 text-center ring-1 ring-line/70 elev-1 ${className}`}
    >
      <div className="mx-auto h-24 w-24" aria-hidden="true">
        <Spot name={spot} />
      </div>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-[34ch] text-sm text-muted" data-testid={bodyTestId}>
        {body}
      </p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
