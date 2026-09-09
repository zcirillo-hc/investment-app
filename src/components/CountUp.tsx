import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../lib/hooks';

interface Props {
  value: number;
  format: (v: number) => string;
  duration?: number;
  className?: string;
  testId?: string;
}

/** Animates from the previous value to the new one. Mounts at the final value (no fake count from zero). */
export function CountUp({ value, format, duration = 800, className, testId }: Props) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (reduced || from === value || duration <= 0) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(step);
      else setShown(value);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [value, reduced, duration]);

  return (
    <span className={className} data-testid={testId} data-value={value}>
      {format(shown)}
    </span>
  );
}
