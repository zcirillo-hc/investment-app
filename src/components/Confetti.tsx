import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useUiStore } from '../state/uiStore';
import { usePrefersReducedMotion } from '../lib/hooks';
import { S } from '../content/strings';

/** Plan v2 R6.3: fires once per jar goal crossing (the store decides). It never forces an action. */
export function Confetti() {
  const key = useUiStore((s) => s.confettiKey);
  const end = useUiStore((s) => s.endConfetti);
  const reduced = usePrefersReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    if (!reduced && canvas.current) {
      try {
        const fire = confetti.create(canvas.current, { resize: true, useWorker: false });
        const colors = ['#2E9E6A', '#F0715A', '#DE9820', '#4A9EE0'];
        void fire({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors });
        window.setTimeout(() => {
          if (!cancelled) void fire({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 }, colors });
        }, 250);
        window.setTimeout(() => {
          if (!cancelled) void fire({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 }, colors });
        }, 450);
      } catch {
        /* canvas unavailable; the badge still shows */
      }
    }
    const t = window.setTimeout(end, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [key, reduced, end]);

  if (key === null) return null;
  return (
    <div data-testid="confetti" className="pointer-events-none fixed inset-0 z-[70]" aria-live="polite">
      <canvas ref={canvas} className="h-full w-full" />
      <div className="elev-3 absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-coral px-4 py-2 text-sm font-bold text-on-coral">
        {S.home.jarGoalReached}
      </div>
    </div>
  );
}
