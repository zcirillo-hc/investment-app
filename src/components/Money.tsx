import { formatCents, formatSignedCents } from '../domain/money';
import { CountUp } from './CountUp';

interface Props {
  cents: number;
  signed?: boolean;
  countUp?: boolean;
  className?: string;
  testId?: string;
}

export function Money({ cents, signed = false, countUp = false, className, testId }: Props) {
  const fmt = signed ? formatSignedCents : formatCents;
  if (countUp) return <CountUp value={cents} format={(v) => fmt(Math.round(v))} className={className} testId={testId} />;
  return (
    <span className={className} data-testid={testId}>
      {fmt(cents)}
    </span>
  );
}
