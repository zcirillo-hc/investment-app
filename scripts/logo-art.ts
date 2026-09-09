/**
 * The Spare Change mark, as hand authored SVG.
 *
 * Logo and link preview pass, 2026-09-09. Three designs live here so the choice can be made
 * from rendered pixels rather than from a description. `kept` is the primary and is the one
 * `scripts/gen-icons.ts` writes into `public/icons/`; the other two are rendered to the
 * scratchpad previews only.
 *
 * Rules the drawing obeys, because an app icon is not an illustration:
 *   - one idea per design, and the idea survives a 16 px render;
 *   - full bleed background, no dead margin, nothing floating clear of the object;
 *   - no text, no hairlines. Every stroke here is a filled shape, so nothing thins out;
 *   - the palette is the product palette (src/index.css), not a new one.
 *
 * Ids are prefixed per instance because the previews inline several of these SVGs into one
 * document, where `<defs>` ids are global and would otherwise collide.
 */

export type Design = 'kept' | 'catch' | 'tile';

export const DESIGNS: Design[] = ['kept', 'catch', 'tile'];

export const DESIGN_TITLES: Record<Design, string> = {
  kept: 'A. Kept Jar (primary)',
  catch: 'B. The Catch',
  tile: 'C. Jar Tile',
};

/** Scale the drawing about its own optical centre, for the Android maskable safe zone. */
interface Options {
  /** 1 = as drawn. The maskable render uses 0.76. */
  scale?: number;
}

/** The optical centre each design scales about. x is always 256; only y differs. */
const CENTRE_Y: Record<Design, number> = { kept: 264, catch: 258, tile: 256 };

function wrap(design: Design, inner: string, opts: Options): string {
  const s = opts.scale ?? 1;
  if (s === 1) return inner;
  const cy = CENTRE_Y[design];
  // The background is drawn by the caller's first two rects, which must stay full bleed, so
  // only the object group is scaled. `inner` here is the object, never the ground.
  return `<g transform="translate(256 ${cy}) scale(${s}) translate(-256 -${cy})">${inner}</g>`;
}

/* -------------------------------------------------------------------------- */
/* A. Kept Jar. The primary.                                                   */
/*                                                                             */
/* One idea: a jar that is filling up. The jar is a solid cream mass on a green */
/* field, and the thing it holds is not an object stuck on top of it, it is the */
/* jar's own contents, so the second element cannot float or read as debris.    */
/* At 16 px: green tile, white jar, warm belly.                                 */
/* -------------------------------------------------------------------------- */

const KEPT_BODY =
  'M126 142 H386 Q414 142 414 196 V378 Q414 436 356 436 H156 Q98 436 98 378 V196 Q98 142 126 142 Z';
const KEPT_WAVE_TOP =
  'M98 212 C142 190 194 230 256 212 C318 194 370 228 414 206 L414 452 L98 452 Z';
const KEPT_WAVE_MAIN =
  'M98 232 C142 210 194 250 256 232 C318 214 370 248 414 226 L414 452 L98 452 Z';

function keptGround(u: string): string {
  return (
    `<rect width="512" height="512" fill="url(#${u}-bg)"/>` +
    `<rect width="512" height="512" fill="url(#${u}-glow)"/>`
  );
}

function keptDefs(u: string): string {
  return (
    `<defs>` +
    `<linearGradient id="${u}-bg" x1="0" y1="0" x2="0.4" y2="1">` +
    `<stop offset="0" stop-color="#34B274"/><stop offset="1" stop-color="#11603A"/>` +
    `</linearGradient>` +
    `<radialGradient id="${u}-glow" cx="0.5" cy="0.34" r="0.68">` +
    `<stop offset="0" stop-color="#BDF3D5" stop-opacity="0.45"/>` +
    `<stop offset="1" stop-color="#BDF3D5" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<linearGradient id="${u}-money" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#F5825F"/><stop offset="0.55" stop-color="#EE8A3C"/>` +
    `<stop offset="1" stop-color="#DC9420"/>` +
    `</linearGradient>` +
    `<linearGradient id="${u}-round" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/>` +
    `<stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0"/>` +
    `<stop offset="0.74" stop-color="#6B3F14" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#6B3F14" stop-opacity="0.16"/>` +
    `</linearGradient>` +
    `<clipPath id="${u}-jar"><path d="${KEPT_BODY}"/></clipPath>` +
    `</defs>`
  );
}

function keptObject(u: string): string {
  return (
    // The jar stands on something. Without this the object floats in the field.
    `<ellipse cx="256" cy="446" rx="180" ry="20" fill="#05301C" opacity="0.22"/>` +
    `<path d="${KEPT_BODY}" fill="#FFFFFF"/>` +
    `<g clip-path="url(#${u}-jar)">` +
    // Two waves twenty pixels apart give the liquid a lit surface without a hairline.
    `<path d="${KEPT_WAVE_TOP}" fill="#FBB067"/>` +
    `<path d="${KEPT_WAVE_MAIN}" fill="url(#${u}-money)"/>` +
    // Volume comes from shading the cylinder, not from specular bars: a bar with rounded
    // ends over the liquid reads as a straw stuck in the jar.
    `<rect x="92" y="130" width="328" height="326" fill="url(#${u}-round)"/>` +
    // The lid casts into the glass, which is what stops the neck reading as a hole.
    `<rect x="92" y="142" width="328" height="26" fill="#CEDDD4" opacity="0.55"/>` +
    `</g>` +
    // Lid: dark cream body, lighter cap, squared off where the two meet.
    `<rect x="108" y="62" width="296" height="88" rx="32" fill="#EBD6B9"/>` +
    `<rect x="108" y="62" width="296" height="62" rx="32" fill="#FFF7EA"/>` +
    `<rect x="108" y="94" width="296" height="30" fill="#FFF7EA"/>`
  );
}

/* -------------------------------------------------------------------------- */
/* B. The Catch.                                                               */
/*                                                                             */
/* A different idea, not a different tint: the moment of keeping. A big coral   */
/* coin dropping into a wide mouthed jar, the jar dark on a pale ground so the  */
/* figure and ground invert against the primary. The coin is contained by the   */
/* jar rim, so again nothing floats.                                            */
/* -------------------------------------------------------------------------- */

const CATCH_BODY =
  'M136 214 H376 Q398 214 398 240 V364 Q398 446 320 446 H192 Q114 446 114 364 V240 Q114 214 136 214 Z';
const CATCH_WAVE =
  'M114 358 C154 338 196 378 256 360 C316 342 358 376 398 354 L398 458 L114 458 Z';

function catchGround(u: string): string {
  return `<rect width="512" height="512" fill="url(#${u}-bg)"/>`;
}

function catchDefs(u: string): string {
  return (
    `<defs>` +
    `<linearGradient id="${u}-bg" x1="0" y1="0" x2="0.3" y2="1">` +
    `<stop offset="0" stop-color="#F1FAF4"/><stop offset="1" stop-color="#BFE7D2"/>` +
    `</linearGradient>` +
    `<linearGradient id="${u}-coin" x1="0" y1="0" x2="0.3" y2="1">` +
    `<stop offset="0" stop-color="#F8836A"/><stop offset="1" stop-color="#EA6047"/>` +
    `</linearGradient>` +
    `<linearGradient id="${u}-glass" x1="0" y1="0" x2="0.2" y2="1">` +
    `<stop offset="0" stop-color="#22945A"/><stop offset="1" stop-color="#0F5A34"/>` +
    `</linearGradient>` +
    `<linearGradient id="${u}-money" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#F5A03C"/><stop offset="1" stop-color="#DC8E20"/>` +
    `</linearGradient>` +
    `<linearGradient id="${u}-round" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/>` +
    `<stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0"/>` +
    `<stop offset="0.74" stop-color="#04351E" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#04351E" stop-opacity="0.22"/>` +
    `</linearGradient>` +
    `<clipPath id="${u}-jar"><path d="${CATCH_BODY}"/></clipPath>` +
    `</defs>`
  );
}

function catchObject(u: string): string {
  return (
    `<ellipse cx="256" cy="452" rx="158" ry="22" fill="#0B4429" opacity="0.20"/>` +
    `<circle cx="256" cy="158" r="104" fill="url(#${u}-coin)"/>` +
    `<circle cx="256" cy="158" r="78" fill="#FFFFFF" opacity="0.20"/>` +
    `<circle cx="256" cy="158" r="52" fill="#E65F45" opacity="0.30"/>` +
    `<path d="${CATCH_BODY}" fill="url(#${u}-glass)"/>` +
    `<g clip-path="url(#${u}-jar)">` +
    `<path d="${CATCH_WAVE}" fill="url(#${u}-money)"/>` +
    `<rect x="108" y="200" width="296" height="260" fill="url(#${u}-round)"/>` +
    `</g>` +
    // The rim is the piece that swallows the coin, so it is drawn last and reads as in front.
    `<rect x="100" y="190" width="312" height="58" rx="26" fill="#2AA366"/>` +
    `<rect x="100" y="190" width="312" height="26" rx="13" fill="#FFFFFF" opacity="0.18"/>`
  );
}

/* -------------------------------------------------------------------------- */
/* C. Jar Tile.                                                                */
/*                                                                             */
/* Third idea: the tile is the jar. No field, no centred object, the frame      */
/* itself is the glass, cropped. The lid becomes a band across the top and the  */
/* contents a band across the bottom, with the edge shading that turns a flat   */
/* rectangle into a cylinder. Reads pale on a Home Screen full of dark icons.   */
/* -------------------------------------------------------------------------- */

const TILE_WAVE_TOP = 'M0 336 C86 308 168 360 256 342 C344 324 428 364 512 338 L512 528 L0 528 Z';
const TILE_WAVE_MAIN = 'M0 358 C86 330 168 382 256 364 C344 346 428 386 512 360 L512 528 L0 528 Z';

function tileGround(): string {
  return `<rect width="512" height="512" fill="#FFF8EE"/>`;
}

function tileDefs(u: string): string {
  return (
    `<defs>` +
    `<linearGradient id="${u}-lid" x1="0" y1="0" x2="0.2" y2="1">` +
    `<stop offset="0" stop-color="#34B274"/><stop offset="1" stop-color="#14683E"/>` +
    `</linearGradient>` +
    `<linearGradient id="${u}-money" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#F5825F"/><stop offset="0.55" stop-color="#EE8A3C"/>` +
    `<stop offset="1" stop-color="#DC9420"/>` +
    `</linearGradient>` +
    `<linearGradient id="${u}-round" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.30"/>` +
    `<stop offset="0.18" stop-color="#FFFFFF" stop-opacity="0"/>` +
    `<stop offset="0.74" stop-color="#4A2E10" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#4A2E10" stop-opacity="0.30"/>` +
    `</linearGradient>` +
    `</defs>`
  );
}

function tileObject(u: string): string {
  return (
    `<path d="${TILE_WAVE_TOP}" fill="#FBB067"/>` +
    `<path d="${TILE_WAVE_MAIN}" fill="url(#${u}-money)"/>` +

    `<rect x="0" y="146" width="512" height="22" fill="#E4D3BC" opacity="0.85"/>` +
    `<rect x="0" y="0" width="512" height="148" fill="url(#${u}-lid)"/>` +
    `<rect x="0" y="110" width="512" height="38" fill="#0C4F2E" opacity="0.30"/>` +
    `<rect x="0" y="0" width="512" height="48" fill="#FFFFFF" opacity="0.16"/>` +
    `<rect x="0" y="470" width="512" height="42" fill="#7A4410" opacity="0.16"/>` +
    `<rect width="512" height="512" fill="url(#${u}-round)"/>`
  );
}

/* -------------------------------------------------------------------------- */

const PARTS: Record<
  Design,
  { defs: (u: string) => string; ground: (u: string) => string; object: (u: string) => string }
> = {
  kept: { defs: keptDefs, ground: keptGround, object: keptObject },
  catch: { defs: catchDefs, ground: catchGround, object: catchObject },
  tile: { defs: tileDefs, ground: tileGround, object: tileObject },
};

/** The drawing without an `<svg>` element, for embedding into a larger canvas. */
export function iconInner(design: Design, uid: string, opts: Options = {}): string {
  const p = PARTS[design];
  return p.defs(uid) + p.ground(uid) + wrap(design, p.object(uid), opts);
}

/** A complete, standalone square SVG document. */
export function icon(design: Design, uid: string, opts: Options = {}): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" ` +
    `role="img" aria-label="Spare Change">${iconInner(design, uid, opts)}</svg>`
  );
}

/**
 * The link preview canvas, 1200 x 630, without its two lines of type. Text is painted by
 * `gen-icons.ts` with the canvas API rather than declared here, so the render never depends
 * on how a given engine resolves a font inside a standalone SVG document.
 */
export function ogCanvas(design: Design): string {
  const u = 'og';
  const mark = 320;
  const x = 96;
  const y = 155;
  const k = mark / 512;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">` +
    `<defs>` +
    `<linearGradient id="${u}-page" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0" stop-color="#F6FCF8"/><stop offset="1" stop-color="#D7EEE0"/>` +
    `</linearGradient>` +
    `<radialGradient id="${u}-halo" cx="0.78" cy="0.16" r="0.6">` +
    `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/>` +
    `<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<clipPath id="${u}-mark"><rect x="${x}" y="${y}" width="${mark}" height="${mark}" rx="74"/></clipPath>` +
    `<filter id="${u}-soft" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feGaussianBlur stdDeviation="20"/></filter>` +
    `</defs>` +
    `<rect width="1200" height="630" fill="url(#${u}-page)"/>` +
    `<rect width="1200" height="630" fill="url(#${u}-halo)"/>` +
    // Two soft rings, large and low contrast, so the card is not an empty gradient.
    `<circle cx="1132" cy="596" r="212" fill="#16703F" opacity="0.06"/>` +
    // A real blur, because an offset copy of the mark with a hard edge reads as a printing fault.
    `<rect x="${x + 6}" y="${y + 30}" width="${mark - 12}" height="${mark}" rx="74" ` +
    `fill="#0B4426" opacity="0.30" filter="url(#${u}-soft)"/>` +
    `<g clip-path="url(#${u}-mark)"><g transform="translate(${x} ${y}) scale(${k})">` +
    `${iconInner(design, u + '-i')}</g></g>` +
    // The accent rule above the name, the only coral on the card.
    `<rect x="500" y="215" width="92" height="12" rx="6" fill="#F0715A"/>` +
    `</svg>`
  );
}
