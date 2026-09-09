import type { LessonId } from '../domain/types';

/** Plan v2 section 8.8: one small inline SVG per lesson. L3 and L8 are redrawn for v2. */
export function LessonVisual({ id }: { id: LessonId }) {
  const common = 'mx-auto my-4 w-full max-w-xs';
  switch (id) {
    case 'L1':
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="A coin splitting off a receipt into the jar">
          <rect x="20" y="16" width="70" height="88" rx="6" className="fill-card stroke-line" strokeWidth="2" />
          <path d="M32 36h46M32 50h46M32 64h30" className="stroke-muted" strokeWidth="3" strokeLinecap="round" />
          <text x="55" y="90" textAnchor="middle" className="fill-ink text-[12px] font-bold">$4.35</text>
          <path d="M96 60 q40 -40 78 6" className="fill-none stroke-amber" strokeWidth="3" strokeDasharray="6 5" />
          <circle cx="128" cy="34" r="9" className="fill-amber" />
          <text x="128" y="38" textAnchor="middle" className="fill-on-fill text-[9px] font-bold">65c</text>
          <path d="M176 60 h44 v40 q0 6 -6 6 h-32 q-6 0 -6 -6z" className="fill-leaf-soft stroke-leaf" strokeWidth="3" />
          <rect x="182" y="50" width="32" height="10" rx="3" className="fill-leaf" />
        </svg>
      );
    case 'L2':
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="A paycheck bar with a small slice highlighted">
          <rect x="20" y="40" width="200" height="40" rx="8" className="fill-line" />
          <rect x="20" y="40" width="190" height="40" rx="8" className="fill-sky" opacity="0.5" />
          <rect x="200" y="40" width="20" height="40" rx="6" className="fill-coral" />
          <text x="110" y="65" textAnchor="middle" className="fill-ink text-[12px] font-bold">paycheck</text>
          <text x="210" y="100" textAnchor="middle" className="fill-coral text-[11px] font-bold">5%</text>
        </svg>
      );
    case 'L3':
      // Plan v2 9.6: the coffee you did not buy. A cup crossed out, its price in the jar.
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="A coffee cup crossed out, with its price moving into the jar">
          <path d="M30 40 h52 l-6 56 q-1 8 -9 8 h-22 q-8 0 -9 -8z" className="fill-card stroke-muted" strokeWidth="3" />
          <path d="M82 52 q18 0 18 14 t-20 12" className="fill-none stroke-muted" strokeWidth="3" />
          <path d="M24 34 l68 74" className="stroke-coral" strokeWidth="5" strokeLinecap="round" />
          <path d="M106 66 q28 -30 54 -4" className="fill-none stroke-amber" strokeWidth="3" strokeDasharray="6 5" />
          <circle cx="134" cy="46" r="10" className="fill-amber" />
          <text x="134" y="50" textAnchor="middle" className="fill-on-amber text-[8px] font-bold">kept</text>
          <path d="M168 54 h48 v46 q0 6 -6 6 h-36 q-6 0 -6 -6z" className="fill-leaf-soft stroke-leaf" strokeWidth="3" />
          <rect x="174" y="44" width="36" height="10" rx="3" className="fill-leaf" />
        </svg>
      );
    case 'L4':
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="A wavy line with you're here below a peak and a higher line later">
          <path d="M16 80 q30 -40 50 -20 t40 -10 t30 30 t40 -20 t50 -30" className="fill-none stroke-leaf" strokeWidth="3" />
          <circle cx="140" cy="82" r="5" className="fill-coral" />
          <text x="140" y="104" textAnchor="middle" className="fill-coral text-[11px] font-bold">you're here</text>
          <path d="M222 30 l-8 -4 l2 8z" className="fill-leaf" />
        </svg>
      );
    case 'L5':
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="A strip of thirty small jars">
          {Array.from({ length: 30 }).map((_, i) => (
            <rect key={i} x={12 + (i % 10) * 22} y={20 + Math.floor(i / 10) * 30} width="16" height="20" rx="4" className={i < 27 ? 'fill-leaf' : 'fill-leaf-soft'} />
          ))}
        </svg>
      );
    case 'L6':
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="A jar with an open lid and a hand">
          <path d="M70 46 h60 v50 q0 6 -6 6 h-48 q-6 0 -6 -6z" className="fill-leaf-soft stroke-leaf" strokeWidth="3" />
          <rect x="78" y="20" width="44" height="10" rx="3" transform="rotate(-20 100 25)" className="fill-leaf" />
          <path d="M150 70 q20 -10 30 4 l-4 26 h-26z" className="fill-amber-soft stroke-amber" strokeWidth="3" strokeLinejoin="round" />
          <path d="M100 76 q30 -30 56 -8" className="fill-none stroke-amber" strokeWidth="3" strokeDasharray="5 4" />
        </svg>
      );
    case 'L7':
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="Two bars: twenty dollars a week for five years versus five hundred once">
          <rect x="40" y="20" width="50" height="84" rx="6" className="fill-leaf" />
          <text x="65" y="115" textAnchor="middle" className="fill-ink text-[10px] font-bold">$20 a week</text>
          <rect x="150" y="96" width="50" height="8" rx="4" className="fill-coral" />
          <text x="175" y="115" textAnchor="middle" className="fill-ink text-[10px] font-bold">$500 once</text>
        </svg>
      );
    case 'L8':
    default:
      // Plan v2 9.6: nothing to time and nothing to pick. One steady line, one arrow.
      return (
        <svg viewBox="0 0 240 120" className={common} role="img" aria-label="A steady line moving forward with three even markers">
          <path d="M24 76 h176" className="stroke-leaf" strokeWidth="4" strokeLinecap="round" />
          <path d="M200 76 l-12 -7 v14z" className="fill-leaf" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx={52 + i * 52} cy={76} r="9" className="fill-leaf-soft stroke-leaf" strokeWidth="3" />
              <rect x={44 + i * 52} y={36} width="16" height={20 + i * 8} rx="4" className="fill-amber" />
            </g>
          ))}
        </svg>
      );
  }
}
