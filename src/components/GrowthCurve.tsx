import { useId } from 'react';
import { formatDollars } from '../domain/money';
import { S } from '../content/strings';

const W = 360;
const H = 160;
const PAD_L = 56;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 30;

/**
 * Plan v2 R10.4. One line: money the user actually put in, growing at the assumed rate.
 *
 * Separate from `SummerCurves` on purpose. Real kept money and the summer hypothetical differ
 * by several orders of magnitude (tens of dollars against tens of thousands), so a third
 * polyline on those axes would sit flat on zero and read as nothing at all. Its own card and
 * its own scale is the only way it says anything.
 */
export function GrowthCurve({ ages, values }: { ages: number[]; values: number[] }) {
  const titleId = useId();
  if (ages.length === 0) return null;
  const minAge = ages[0];
  const maxAge = ages[ages.length - 1];
  const maxValue = Math.max(1, ...values);

  const x = (age: number) => PAD_L + ((age - minAge) / Math.max(1, maxAge - minAge)) * (W - PAD_L - PAD_R);
  const y = (value: number) => H - PAD_B - (value / maxValue) * (H - PAD_T - PAD_B);
  const points = ages.map((a, i) => `${x(a).toFixed(1)},${y(values[i]).toFixed(1)}`).join(' ');
  const yTicks = [0, 0.5, 1].map((f) => Math.round(maxValue * f));
  const xTicks = [minAge, Math.round((minAge + maxAge) / 2), maxAge].filter((a, i, arr) => arr.indexOf(a) === i);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      role="img"
      aria-labelledby={titleId}
      data-testid="growth-curve"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={titleId}>{S.summer.yourMoneyChartTitle}</title>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth="1" />
          <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-[9px]">
            {formatDollars(v)}
          </text>
        </g>
      ))}
      {xTicks.map((a) => (
        <text key={a} x={x(a)} y={H - PAD_B + 14} textAnchor="middle" className="fill-muted text-[9px]">
          {a}
        </text>
      ))}
      <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} textAnchor="middle" className="fill-muted text-[9px]">
        {S.summer.axisAge}
      </text>
      <polyline points={points} fill="none" stroke="#2E9E6A" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" data-testid="growth-curve-line" />
    </svg>
  );
}
