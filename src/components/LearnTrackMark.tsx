/**
 * Visual polish pass, 2026-09-09. The three Learn tracks, given a visual identity.
 *
 * Sixteen identical white pills read as a syllabus, which is exactly what the library is not
 * meant to feel like. Each track gets a colour, a glyph and a tinted panel, and the reader
 * page carries the same mark, so a piece looks like it belongs somewhere.
 *
 * Every pair here is one of the token pairs the contrast unit test already measures:
 * `text-leaf` on `leaf-soft`, `amber-ink` on `amber-soft`, `coral-ink` on `coral-soft`, and
 * the `on-*` labels on their own fills. No new colour is introduced, in either theme.
 *
 * The panels are damped in dark mode, and only there. The dark tints are deep enough that a
 * whole track panel painted in one reads as a coloured block rather than as a tint; at 45 to
 * 50 percent the colour still says which track this is without taking the screen over. The
 * damping is safe for contrast because the composited background lands between two grounds
 * the contrast test already measures for this text, and the ratio moves monotonically between
 * them.
 */
export interface TrackSkin {
  /** Tinted panel behind a whole track. */
  panel: string;
  /** The filled badge behind the track glyph. */
  badge: string;
  /** The glyph colour that reads on that badge. */
  glyph: string;
  /** The tinted pill used for a piece's index number and its "read" flag. */
  pill: string;
  icon: string;
}

export const TRACK_SKINS: Record<string, TrackSkin> = {
  'getting-started': {
    panel: 'bg-leaf-soft dark:bg-leaf-soft/50',
    badge: 'bg-leaf',
    glyph: 'text-on-leaf',
    pill: 'bg-leaf-soft text-leaf',
    icon: 'M6.5 21V3.6M6.5 4.6h12l-2.7 4 2.7 4h-12',
  },
  markets: {
    panel: 'bg-amber-soft dark:bg-amber-soft/45',
    badge: 'bg-amber',
    glyph: 'text-on-amber',
    pill: 'bg-amber-soft text-amber-ink',
    icon: 'M4 18.5h16M6.5 15V8.5M11 15V5M15.5 15v-4M20 15V9',
  },
  'staying-sane': {
    panel: 'bg-coral-soft dark:bg-coral-soft/45',
    badge: 'bg-coral',
    glyph: 'text-on-coral',
    pill: 'bg-coral-soft text-coral-ink',
    icon: 'M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.6a4.5 4.5 0 0 1 7.5 2.9c0 5.4-7.5 10-7.5 10z',
  },
};

export function trackSkin(key: string | undefined): TrackSkin {
  return (key && TRACK_SKINS[key]) || TRACK_SKINS['getting-started'];
}

export function TrackBadge({ skin, size = 40 }: { skin: TrackSkin; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl ${skin.badge}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={skin.glyph} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={skin.icon} />
      </svg>
    </span>
  );
}
