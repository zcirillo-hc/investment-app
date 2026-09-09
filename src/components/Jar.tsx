import { usePrefersReducedMotion } from '../lib/hooks';
import { jarFillRatio } from '../domain/jar';

interface Props {
  jarCents: number;
  goalCents: number;
}

const W = 160;
const H = 200;
const INNER_TOP = 48;
const INNER_BOTTOM = 186;
const INNER_H = INNER_BOTTOM - INNER_TOP;
const BODY = 'M28 40 h104 q10 0 10 12 v122 q0 14 -14 14 h-96 q-14 0 -14 -14 v-122 q0 -12 10 -12 z';

/**
 * Plan v2 R6.3: liquid height = min(1, jar / goal). The rect's height attribute animates.
 *
 * Visual polish pass, 2026-09-09. The jar is the signature object, so it earns real drawing:
 * a cast shadow, glass with two highlights and a rim, coins resting at the bottom, and a
 * surface that moves. The fill ratio, the test ids and the reduced motion behaviour are all
 * exactly what they were; everything added here is paint.
 *
 * The wave is two nested transforms on purpose. The outer one carries the liquid height and
 * therefore the 0.7 s ease that the rect already used, so the surface and the body rise
 * together. The inner one carries the horizontal drift, as a CSS animation, so the global
 * `prefers-reduced-motion` rule in `index.css` stops it without this component asking.
 */
export function Jar({ jarCents, goalCents }: Props) {
  const reduced = usePrefersReducedMotion();
  const ratio = jarFillRatio(jarCents, goalCents);
  const h = Math.round(ratio * INNER_H * 100) / 100;
  const y = INNER_BOTTOM - h;
  const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const glide = reduced ? 'none' : `height 0.7s ${ease}, y 0.7s ${ease}, transform 0.7s ${ease}`;
  return (
    <svg data-testid="jar" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" className="mx-auto max-h-[220px]" role="img" aria-label="Jar">
      <defs>
        <clipPath id="jar-clip">
          <path d={BODY} />
        </clipPath>
        <linearGradient id="jar-liquid" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F0715A" />
          <stop offset="0.55" stopColor="#EA8437" />
          <stop offset="1" stopColor="#DE9820" />
        </linearGradient>
        {/*
          A specular highlight is white in both themes: it is light bouncing off glass, not a
          surface colour. `currentColor` is deliberately not used, because a stop resolves it
          against the gradient element in `defs` rather than against the shape referencing it.
        */}
        <linearGradient id="jar-glass" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* The jar stands on something. Without this it floats in the card. */}
      <ellipse cx={W / 2} cy={194} rx={54} ry={7} className="fill-leaf" opacity="0.16" />

      <path d={BODY} className="fill-card" />
      <path d={BODY} className="fill-leaf" opacity="0.06" />

      <g clipPath="url(#jar-clip)">
        {/*
          Coins settled at the bottom, and only when there is actually something in the jar.
          Drawing them at zero looked better and was a small lie: the jar's fill is the app's
          one honest picture of the balance, so nothing may sit in it that the number does not
          account for. An empty jar is empty.
        */}
        {jarCents > 0 && (
          <g opacity="0.55">
            <ellipse cx={52} cy={180} rx={15} ry={5} className="fill-amber" />
            <ellipse cx={86} cy={183} rx={17} ry={5.5} className="fill-amber" />
            <ellipse cx={112} cy={178} rx={13} ry={4.5} className="fill-coral" />
          </g>
        )}

        <rect
          data-testid="jar-fill"
          data-ratio={ratio.toFixed(3)}
          x={18}
          width={W - 36}
          y={y}
          height={h}
          style={{ transition: glide }}
          fill="url(#jar-liquid)"
        />

        {h > 4 && (
          <g style={{ transform: `translateY(${y}px)`, transition: glide }}>
            <g className={reduced ? undefined : 'jar-wave'}>
              {/* Drawn 2.25 jars wide and shifted by exactly one repeat, so the loop is seamless. */}
              {/* Flat, not the body gradient: a gradient here would re-map to the wave's own
                  box and paint a second band across the surface. This is the liquid's top colour. */}
              <path
                d="M-40 2 q18 -7 36 0 q18 7 36 0 q18 -7 36 0 q18 7 36 0 q18 -7 36 0 q18 7 36 0 l0 14 l-216 0 z"
                fill="#F0715A"
              />
              <path
                d="M-40 2 q18 -7 36 0 q18 7 36 0 q18 -7 36 0 q18 7 36 0 q18 -7 36 0 q18 7 36 0"
                className="stroke-card"
                strokeWidth="2"
                fill="none"
                opacity="0.5"
              />
            </g>
          </g>
        )}
      </g>

      {/* Glass: the outline, a bright specular stripe and a thin one on the far edge. */}
      <path d={BODY} className="fill-none stroke-leaf" strokeWidth="4" />
      <g className="text-card" opacity="0.85">
        <path d="M44 62 v96" stroke="url(#jar-glass)" strokeWidth="7" strokeLinecap="round" fill="none" />
        <path d="M120 76 v58" stroke="url(#jar-glass)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6" />
      </g>

      {/* Lid, with its own highlight so it reads as a solid object rather than a flat bar. */}
      <rect x={40} y={16} width={80} height={28} rx={9} className="fill-leaf" />
      <rect x={47} y={21} width={26} height={6} rx={3} className="fill-card" opacity="0.35" />
      <rect x={34} y={36} width={92} height={9} rx={4.5} className="fill-leaf" />

      {/* The goal line, with a tick on the rim so it reads as a mark rather than a divider. */}
      <line x1={26} y1={INNER_TOP} x2={134} y2={INNER_TOP} className="stroke-muted" strokeWidth="2" strokeDasharray="4 4" opacity="0.75" />
      <circle cx={138} cy={INNER_TOP} r={3.5} className="fill-muted" opacity="0.75" />
    </svg>
  );
}
