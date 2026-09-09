import { motion } from 'framer-motion';
import type { TreeStage } from '../domain/tree';
import { usePrefersReducedMotion } from '../lib/hooks';

/**
 * Plan 4.12: one drawing per stage, scale-in on stage change.
 *
 * Visual polish pass, 2026-09-09: the tree now stands on ground rather than on a flat pill,
 * and the canopy sways. The sway is a CSS animation on an inner group, so the global
 * `prefers-reduced-motion` rule stops it, and it composes with framer's scale-in above it
 * rather than fighting it for the same `transform`.
 */
export function Tree({ stage }: { stage: TreeStage }) {
  const reduced = usePrefersReducedMotion();
  return (
    <svg data-testid="tree" data-stage={stage} viewBox="0 0 160 160" width="100%" height="100%" className="mx-auto max-h-[200px]" role="img" aria-label={`Tree stage ${stage}`}>
      <ellipse cx="80" cy="141" rx="56" ry="11" className="fill-leaf-soft" />
      <ellipse cx="80" cy="139" rx="34" ry="6" className="fill-leaf" opacity="0.14" />
      <path d="M40 138 q3 -8 6 0 M52 140 q3 -9 6 0 M108 139 q3 -8 6 0" className="stroke-leaf" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" />
      <circle cx="122" cy="132" r="3" className="fill-amber" opacity="0.6" />
      <motion.g
        key={stage}
        data-testid={`tree-stage-${stage}`}
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 14 }}
        style={{ transformOrigin: '80px 140px' }}
      >
      <g className={reduced ? undefined : 'sway'}>
        {stage === 0 && (
          <>
            <ellipse cx="80" cy="132" rx="9" ry="6" className="fill-amber" />
            <path d="M80 126 q4 -6 8 -4" className="stroke-leaf fill-none" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {stage === 1 && (
          <>
            <path d="M80 138 v-22" className="stroke-leaf" strokeWidth="4" strokeLinecap="round" />
            <path d="M80 122 q-14 -6 -14 -18 q14 2 14 18z" className="fill-leaf" />
            <path d="M80 118 q14 -8 14 -20 q-14 4 -14 20z" className="fill-leaf" />
          </>
        )}
        {stage === 2 && (
          <>
            <path d="M80 138 v-40" className="stroke-amber" strokeWidth="5" strokeLinecap="round" />
            <path d="M80 110 q-20 -8 -20 -26 q20 4 20 26z" className="fill-leaf" />
            <path d="M80 100 q20 -10 20 -28 q-20 6 -20 28z" className="fill-leaf" />
            <path d="M80 120 q-14 -2 -16 -14 q14 2 16 14z" className="fill-leaf" opacity="0.8" />
          </>
        )}
        {stage === 3 && (
          <>
            <path d="M80 138 v-58" className="stroke-amber" strokeWidth="6" strokeLinecap="round" />
            <path d="M80 100 l-18 -14 M80 90 l16 -14" className="stroke-amber" strokeWidth="4" strokeLinecap="round" />
            <circle cx="60" cy="82" r="14" className="fill-leaf" />
            <circle cx="98" cy="72" r="15" className="fill-leaf" />
            <circle cx="80" cy="62" r="17" className="fill-leaf" />
          </>
        )}
        {stage === 4 && (
          <>
            <path d="M80 138 v-66" className="stroke-amber" strokeWidth="8" strokeLinecap="round" />
            <path d="M80 104 l-24 -18 M80 92 l24 -18" className="stroke-amber" strokeWidth="5" strokeLinecap="round" />
            <circle cx="54" cy="80" r="18" className="fill-leaf" />
            <circle cx="106" cy="70" r="19" className="fill-leaf" />
            <circle cx="80" cy="54" r="22" className="fill-leaf" />
            <circle cx="72" cy="78" r="14" className="fill-leaf" opacity="0.9" />
          </>
        )}
        {stage === 5 && (
          <>
            <path d="M80 138 v-72" className="stroke-amber" strokeWidth="10" strokeLinecap="round" />
            <path d="M80 100 l-30 -22 M80 88 l30 -22" className="stroke-amber" strokeWidth="6" strokeLinecap="round" />
            <circle cx="46" cy="74" r="20" className="fill-leaf" />
            <circle cx="114" cy="64" r="21" className="fill-leaf" />
            <circle cx="80" cy="44" r="26" className="fill-leaf" />
            <circle cx="66" cy="70" r="16" className="fill-leaf" opacity="0.9" />
            <circle cx="96" cy="78" r="15" className="fill-leaf" opacity="0.9" />
            <circle cx="60" cy="60" r="4" className="fill-coral" />
            <circle cx="104" cy="52" r="4" className="fill-coral" />
          </>
        )}
        {stage === 6 && (
          <>
            <path d="M80 138 v-76" className="stroke-amber" strokeWidth="12" strokeLinecap="round" />
            <path d="M80 100 l-36 -26 M80 86 l36 -26 M80 112 l-20 -8 M80 108 l22 -6" className="stroke-amber" strokeWidth="6" strokeLinecap="round" />
            <circle cx="38" cy="70" r="22" className="fill-leaf" />
            <circle cx="122" cy="60" r="23" className="fill-leaf" />
            <circle cx="80" cy="36" r="30" className="fill-leaf" />
            <circle cx="60" cy="58" r="20" className="fill-leaf" />
            <circle cx="102" cy="70" r="20" className="fill-leaf" />
            <circle cx="80" cy="72" r="18" className="fill-leaf" opacity="0.95" />
            <circle cx="52" cy="52" r="4" className="fill-coral" />
            <circle cx="110" cy="44" r="4" className="fill-coral" />
            <circle cx="84" cy="24" r="4" className="fill-coral" />
            <circle cx="70" cy="80" r="4" className="fill-coral" />
          </>
        )}
      </g>
      </motion.g>
    </svg>
  );
}
