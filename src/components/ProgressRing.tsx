import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../lib/hooks';

interface Props {
  value: number;
  total: number;
  label: string;
  size?: number;
  /** Small print under the label, for example how many are left. */
  hint?: string;
  /** What assistive tech reads for the ring itself. Defaults to the visible label. */
  aria?: string;
}

/**
 * Visual polish pass, 2026-09-09. Same geometry and the same test ids; what changed is that
 * the track is now a tinted ring rather than a grey one, the arc has a soft halo behind it so
 * a small value still reads as progress, and the count is set as two sizes rather than one
 * run of digits.
 */
export function ProgressRing({ value, total, label, size = 104, hint, aria }: Props) {
  const reduced = usePrefersReducedMotion();
  const r = 40;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div data-testid="progress-ring" data-value={value} data-total={total} className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0" role="img" aria-label={aria ?? label}>
        <circle cx="50" cy="50" r={r} className="fill-none stroke-leaf-soft" strokeWidth="11" />
        <circle cx="50" cy="50" r={r} className="fill-none stroke-line" strokeWidth="1" opacity="0.7" />
        {frac > 0 && (
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            className="fill-none stroke-leaf"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={c}
            opacity="0.16"
            initial={false}
            animate={{ strokeDashoffset: c * (1 - frac) }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            transform="rotate(-90 50 50)"
          />
        )}
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          className="fill-none stroke-leaf"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={reduced ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="52" textAnchor="middle" className="fill-ink text-[21px] font-extrabold">
          {value}
        </text>
        <text x="50" y="66" textAnchor="middle" className="fill-muted text-[11px] font-bold">
          of {total}
        </text>
      </svg>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight">{label}</div>
        {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
      </div>
    </div>
  );
}
