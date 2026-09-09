import { useId } from 'react';
import { formatDollars } from '../domain/money';
import { S } from '../content/strings';

export interface SummerPoint {
  age: number;
  now: number;
  later: number;
}

const W = 360;
const H = 220;
const PAD_L = 56;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 34;
const X_TICKS = [19, 30, 40, 50, 65];

/**
 * Plan v2 section 1.1: two polylines and axis labels in inline SVG. This is what lets Recharts
 * leave the project (criterion 3 and 14). It draws only what the domain already computed;
 * there is no scale library and no runtime dependency.
 */
export function SummerCurves({ data }: { data: SummerPoint[] }) {
  const titleId = useId();
  if (data.length === 0) return null;
  const minAge = data[0].age;
  const maxAge = data[data.length - 1].age;
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.now, d.later)));

  const x = (age: number) => PAD_L + ((age - minAge) / Math.max(1, maxAge - minAge)) * (W - PAD_L - PAD_R);
  const y = (value: number) => H - PAD_B - (value / maxValue) * (H - PAD_T - PAD_B);
  const points = (key: 'now' | 'later') => data.map((d) => `${x(d.age).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');

  const yTicks = [0, 0.5, 1].map((f) => Math.round(maxValue * f));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      role="img"
      aria-labelledby={titleId}
      data-testid="summer-curves"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={titleId}>{S.summer.chartTitle}</title>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth="1" />
          <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-[9px]">
            {formatDollars(v)}
          </text>
        </g>
      ))}
      {X_TICKS.filter((a) => a >= minAge && a <= maxAge).map((a) => (
        <text key={a} x={x(a)} y={H - PAD_B + 14} textAnchor="middle" className="fill-muted text-[9px]">
          {a}
        </text>
      ))}
      <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} textAnchor="middle" className="fill-muted text-[9px]">
        {S.summer.axisAge}
      </text>
      <polyline points={points('later')} fill="none" stroke="#F0715A" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" data-testid="summer-curve-later" />
      <polyline points={points('now')} fill="none" stroke="#2E9E6A" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" data-testid="summer-curve-now" />
      <g>
        <rect x={PAD_L + 4} y={PAD_T} width="10" height="4" rx="2" fill="#2E9E6A" />
        <text x={PAD_L + 18} y={PAD_T + 5} className="fill-ink text-[9px] font-semibold">
          {S.summer.curveNow}
        </text>
        <rect x={PAD_L + 74} y={PAD_T} width="10" height="4" rx="2" fill="#F0715A" />
        <text x={PAD_L + 88} y={PAD_T + 5} className="fill-ink text-[9px] font-semibold">
          {S.summer.curveLater}
        </text>
      </g>
    </svg>
  );
}
