import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUiStore } from '../state/uiStore';
import { usePrefersReducedMotion } from '../lib/hooks';
import { S } from '../content/strings';

/**
 * Plan v2 section 1.1: the same motion as v1's sweep animation, now fired by a user confirmed
 * jar move (R6.4) rather than by an automatic sweep, which no longer exists (R6.2).
 */
export function JarMoveAnimation() {
  const anim = useUiStore((s) => s.jarMoveAnimation);
  const end = useUiStore((s) => s.endJarMoveAnimation);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (!anim) return;
    const t = window.setTimeout(end, reduced ? 1600 : 2400);
    return () => window.clearTimeout(t);
  }, [anim, end, reduced]);
  if (!anim) return null;
  const coins = [0, 1, 2, 3, 4, 5];
  return (
    <div data-testid="jar-move-animation" data-cents={anim.cents} className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-card">
      {!reduced &&
        coins.map((i) => (
          <motion.span
            key={`${anim.key}-${i}`}
            className="absolute left-1/2 top-1/3 h-4 w-4 rounded-full bg-amber shadow"
            initial={{ x: -8 + (i % 3) * 8, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: 90 + i * 6, y: 120, opacity: 0, scale: 0.5 }}
            transition={{ duration: 1.1, delay: i * 0.08, ease: 'easeIn' }}
          />
        ))}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.5 }}
        className="absolute inset-x-3 bottom-3 rounded-2xl bg-leaf px-3 py-2 text-center text-sm font-semibold text-on-leaf shadow-lg"
      >
        {S.jarMove.banner(anim.cents)}
      </motion.div>
    </div>
  );
}
