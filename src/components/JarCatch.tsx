import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatSignedCents } from '../domain/money';
import { usePrefersReducedMotion } from '../lib/hooks';

/**
 * Visual polish pass, 2026-09-09. The other half of the jar animation.
 *
 * `JarMoveAnimation` plays when money leaves the jar. Nothing played when money arrived, and
 * arriving is the emotional payoff of the whole product: you skip the coffee, and you watch
 * the money land. So this watches the jar total and, whenever it grows, drops coins into the
 * jar and floats the amount that just landed.
 *
 * It is deliberately local rather than a new store action. The trigger is "the number went
 * up", which is true of a skip, a round-up and an accepted catch alike, and none of those
 * three should have to remember to fire an animation. Nothing here can run on mount: the
 * previous value starts at the current one, so a reload does not replay the last credit.
 */
export function JarCatch({ jarCents }: { jarCents: number }) {
  const reduced = usePrefersReducedMotion();
  const prev = useRef(jarCents);
  const [event, setEvent] = useState<{ cents: number; key: number } | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    const before = prev.current;
    prev.current = jarCents;
    if (jarCents <= before) return;
    keyRef.current += 1;
    setEvent({ cents: jarCents - before, key: keyRef.current });
  }, [jarCents]);

  useEffect(() => {
    if (!event) return;
    const t = window.setTimeout(() => setEvent(null), reduced ? 1100 : 1700);
    return () => window.clearTimeout(t);
  }, [event, reduced]);

  if (!event) return null;
  const coins = [0, 1, 2, 3, 4];
  return (
    <div data-testid="jar-catch" data-cents={event.cents} className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-card">
      {!reduced &&
        coins.map((i) => (
          <motion.span
            key={`${event.key}-${i}`}
            className="absolute left-1/2 top-8 h-3 w-3 rounded-full bg-amber elev-1"
            initial={{ x: -26 + i * 13, y: -14, opacity: 0, scale: 0.6 }}
            animate={{ x: -18 + i * 9, y: 128, opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{ duration: 0.85, delay: i * 0.07, ease: [0.4, 0, 0.9, 0.6] }}
          />
        ))}
      <motion.div
        key={event.key}
        initial={reduced ? false : { opacity: 0, y: 14, scale: 0.9 }}
        animate={{ opacity: [0, 1, 1, 0], y: reduced ? 0 : -18, scale: 1 }}
        transition={{ duration: reduced ? 0.9 : 1.5, delay: reduced ? 0 : 0.35, times: [0, 0.15, 0.72, 1] }}
        className="absolute inset-x-0 top-[34%] flex justify-center"
      >
        <span className="rounded-full bg-leaf px-3 py-1.5 text-base font-extrabold text-on-leaf elev-2 num">{formatSignedCents(event.cents)}</span>
      </motion.div>
    </div>
  );
}
