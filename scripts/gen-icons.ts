/**
 * Renders `scripts/logo-art.ts` into the shipped icon and link preview PNGs.
 *
 * Logo and link preview pass, 2026-09-09.
 *
 * No image library is added. Playwright is already a dev dependency for the e2e suite, so the
 * rasteriser is Chromium: the SVG is drawn into a 2d canvas at the exact target size and the
 * raw pixels come back here, where a small PNG encoder writes them out. Encoding by hand is
 * not showing off, it is the requirement: iOS composites a transparent Home Screen icon onto
 * black, so `apple-touch-icon-180.png` must carry no alpha channel at all, and owning the
 * encoder is the only way to be certain of the colour type. Every icon here is full bleed and
 * opaque, so they are all written as PNG colour type 2 (truecolour, no alpha).
 *
 * The corners are deliberately square. iOS applies its own squircle mask; a pre-rounded icon
 * gets rounded twice and shows dark notches.
 *
 * Usage:
 *   tsx scripts/gen-icons.ts                     writes public/icons/*
 *   tsx scripts/gen-icons.ts --previews <dir>    also writes the side by side comparisons
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { DESIGNS, DESIGN_TITLES, type Design, icon, ogCanvas } from './logo-art';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'public', 'icons');

/** The design that ships. The other two are rendered into the previews only. */
const PRIMARY: Design = 'kept';

/* ----------------------------- the PNG encoder ---------------------------- */

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * RGBA in, opaque PNG out. The alpha byte of every pixel is dropped rather than composited,
 * which is safe because the canvas it came from was created with `{ alpha: false }` and every
 * design paints its own full bleed ground.
 */
function encodePng(rgba: Buffer, w: number, h: number): Buffer {
  const bpp = 3;
  const stride = w * bpp;
  const raw = Buffer.alloc(h * (stride + 1));
  const cur = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = x * bpp;
      cur[d] = rgba[s];
      cur[d + 1] = rgba[s + 1];
      cur[d + 2] = rgba[s + 2];
    }
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        let v: number;
        if (f === 0) v = cur[i];
        else if (f === 1) v = cur[i] - a;
        else if (f === 2) v = cur[i] - b;
        else if (f === 3) v = cur[i] - ((a + b) >> 1);
        else v = cur[i] - paeth(a, b, c);
        v &= 0xff;
        cand[f][i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
    prev = Buffer.from(cur);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2, truecolour, no alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Reads back what was actually written, so nothing here is claimed rather than observed. */
export function readPngHeader(buf: Buffer): {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  hasAlpha: boolean;
} {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colourType = buf[25];
  return { width, height, bitDepth, colourType, hasAlpha: colourType === 4 || colourType === 6 };
}

/* ------------------------------ rasterising ------------------------------- */

interface TextOp {
  text: string;
  x: number;
  y: number;
  font: string;
  colour: string;
}

async function raster(page: Page, svg: string, w: number, h: number, text: TextOp[] = []): Promise<Buffer> {
  const b64 = await page.evaluate(
    async (args: { svg: string; w: number; h: number; text: TextOp[] }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(args.svg);
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = args.w;
      canvas.height = args.h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, args.w, args.h);
      ctx.drawImage(img, 0, 0, args.w, args.h);
      for (const op of args.text) {
        ctx.font = op.font;
        ctx.fillStyle = op.colour;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(op.text, op.x, op.y);
      }
      const data = ctx.getImageData(0, 0, args.w, args.h).data;
      let s = '';
      const step = 0x2000;
      for (let i = 0; i < data.length; i += step) {
        s += String.fromCharCode(...Array.from(data.subarray(i, i + step)));
      }
      return btoa(s);
    },
    { svg, w, h, text },
  );
  return encodePng(Buffer.from(b64, 'base64'), w, h);
}

function write(path: string, buf: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  const head = readPngHeader(buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(
    `  ${path.replace(ROOT + '/', '')}  ${head.width}x${head.height}  ` +
      `colourType=${head.colourType} alpha=${head.hasAlpha} ${kb} kB`,
  );
}

/* -------------------------------- previews -------------------------------- */

function dataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** A stand in for a neighbouring Home Screen icon, so the mark is judged in company. */
function fakeIcon(bg: string, glyph: string, colour: string, label: string): string {
  return (
    `<figure><div class="tile" style="background:${bg};color:${colour}">${glyph}</div>` +
    `<figcaption>${label}</figcaption></figure>`
  );
}

async function shot(page: Page, html: string, width: number, path: string): Promise<void> {
  await page.setViewportSize({ width, height: 400 });
  await page.setContent(html, { waitUntil: 'load' });
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  console.log(`  ${path}`);
}

const PAGE_CSS = `
  body { margin:0; font:14px -apple-system,system-ui,Helvetica,Arial,sans-serif; }
  figure { margin:0; text-align:center; }
  figcaption { margin-top:10px; font-size:13px; }
`;

async function previews(page: Page, dir: string): Promise<void> {
  const at512 = new Map<Design, Buffer>();
  const at180 = new Map<Design, Buffer>();
  const at32 = new Map<Design, Buffer>();
  for (const d of DESIGNS) {
    at512.set(d, await raster(page, icon(d, `p-${d}-a`), 512, 512));
    at180.set(d, await raster(page, icon(d, `p-${d}-b`), 180, 180));
    at32.set(d, await raster(page, icon(d, `p-${d}-c`), 32, 32));
  }

  // 1. The three designs at 512, flat, no mask.
  await shot(
    page,
    `<style>${PAGE_CSS}
      body { background:#f4f6f5; padding:40px; }
      .row { display:flex; gap:40px; }
      img { width:512px; height:512px; display:block; border-radius:0; box-shadow:0 10px 30px rgba(0,0,0,.14); }
      figcaption { font-size:20px; font-weight:600; }
    </style>
    <div class="row">${DESIGNS.map(
      (d) =>
        `<figure><img src="${dataUrl(at512.get(d) as Buffer)}"><figcaption>${DESIGN_TITLES[d]}</figcaption></figure>`,
    ).join('')}</div>`,
    512 * 3 + 40 * 4,
    join(dir, 'designs-512.png'),
  );

  // 2. 180 px, squircle masked, on a wallpaper, next to stand in apps.
  const tiles: string[] = [];
  tiles.push(fakeIcon('linear-gradient(#5BD75B,#0EAF3E)', '&#9679;&#9679;&#9679;', '#fff', 'Messages'));
  tiles.push(
    `<figure><img class="tile" src="${dataUrl(at180.get('kept') as Buffer)}"><figcaption>A. Kept Jar</figcaption></figure>`,
  );
  tiles.push(fakeIcon('linear-gradient(#FF6A88,#C2185B)', '&#9835;', '#fff', 'Music'));
  tiles.push(fakeIcon('linear-gradient(#4FA8FF,#1565C0)', '&#9992;', '#fff', 'Maps'));
  tiles.push(fakeIcon('linear-gradient(#FFF9C4,#FFD54F)', '&#9998;', '#7a5b00', 'Notes'));
  tiles.push(
    `<figure><img class="tile" src="${dataUrl(at180.get('catch') as Buffer)}"><figcaption>B. The Catch</figcaption></figure>`,
  );
  tiles.push(
    `<figure><img class="tile" src="${dataUrl(at180.get('tile') as Buffer)}"><figcaption>C. Jar Tile</figcaption></figure>`,
  );
  tiles.push(fakeIcon('linear-gradient(#2B2B2E,#0A0A0C)', '&#9654;', '#fff', 'Player'));
  await shot(
    page,
    `<style>${PAGE_CSS}
      body { background:linear-gradient(160deg,#2b4a63,#7e5f86 55%,#c07f6a); padding:48px; color:#fff; }
      .grid { display:grid; grid-template-columns:repeat(4,180px); gap:48px 56px; }
      .tile { width:180px; height:180px; border-radius:40px; display:flex; align-items:center;
              justify-content:center; font-size:56px; box-shadow:0 8px 20px rgba(0,0,0,.35); }
      figcaption { color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.6); }
      h1 { font-size:18px; font-weight:500; margin:0 0 28px; opacity:.85; }
    </style>
    <h1>180 px, iOS squircle radius applied by the preview, not baked into the file</h1>
    <div class="grid">${tiles.join('')}</div>`,
    180 * 4 + 56 * 3 + 96,
    join(dir, 'home-screen-180.png'),
  );

  // 3. 32 px legibility: the real 32 px raster, then the same file blown up with no smoothing.
  await shot(
    page,
    `<style>${PAGE_CSS}
      body { padding:36px; background:#fff; }
      .strip { display:flex; gap:56px; align-items:flex-end; margin-bottom:34px; }
      .dark { background:#1b1f1d; }
      .real { width:32px; height:32px; border-radius:7px; }
      .zoom { width:192px; height:192px; border-radius:0; image-rendering:pixelated; }
      .band { padding:22px 36px; border-radius:14px; display:flex; gap:56px; align-items:center; }
      h1 { font-size:16px; margin:0 0 18px; }
    </style>
    <h1>32 px, as actually rasterised</h1>
    <div class="band" style="background:#f2f5f3">${DESIGNS.map(
      (d) => `<figure><img class="real" src="${dataUrl(at32.get(d) as Buffer)}"><figcaption>${d}</figcaption></figure>`,
    ).join('')}</div>
    <div class="band dark" style="color:#fff">${DESIGNS.map(
      (d) => `<figure><img class="real" src="${dataUrl(at32.get(d) as Buffer)}"><figcaption>${d}</figcaption></figure>`,
    ).join('')}</div>
    <h1 style="margin-top:28px">The same 32 px files at 6x, no smoothing</h1>
    <div class="strip">${DESIGNS.map(
      (d) => `<figure><img class="zoom" src="${dataUrl(at32.get(d) as Buffer)}"><figcaption>${d}</figcaption></figure>`,
    ).join('')}</div>`,
    192 * 3 + 56 * 2 + 96,
    join(dir, 'small-32.png'),
  );

  // 4. Alternate link preview cards, so the choice covers the shared tile too.
  for (const d of DESIGNS) {
    if (d === PRIMARY) continue;
    write(join(dir, `og-${d}.png`), await ogImage(page, d));
  }
}

/* -------------------------------- outputs --------------------------------- */

const OG_TEXT: TextOp[] = [
  {
    text: 'Spare Change',
    x: 500,
    y: 325,
    font: '700 92px -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif',
    colour: '#16281F',
  },
  {
    text: 'Keep a little. It goes a long way.',
    x: 500,
    y: 397,
    font: '500 40px -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif',
    colour: '#4A5C51',
  },
];

function ogImage(page: Page, design: Design): Promise<Buffer> {
  return raster(page, ogCanvas(design), 1200, 630, OG_TEXT);
}

/** Pretty printed so the shipped SVG favicon is readable rather than one long line. */
function svgFile(): string {
  return `${icon(PRIMARY, 'sc')}\n`.replace(/><(?!\/)/g, '>\n  <');
}

async function main(): Promise<void> {
  const flag = process.argv.indexOf('--previews');
  const previewDir = flag === -1 ? null : process.argv[flag + 1];

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');

  console.log('icons:');
  writeFileSync(join(ICONS, 'logo.svg'), svgFile());
  console.log(`  public/icons/logo.svg`);
  write(join(ICONS, 'icon-192.png'), await raster(page, icon(PRIMARY, 'i192'), 192, 192));
  write(join(ICONS, 'icon-512.png'), await raster(page, icon(PRIMARY, 'i512'), 512, 512));
  // Android crops a maskable icon to a circle of 80% of the width, so the object, and only
  // the object, shrinks to fit inside it. The ground stays full bleed.
  write(
    join(ICONS, 'icon-maskable-512.png'),
    await raster(page, icon(PRIMARY, 'imask', { scale: 0.76 }), 512, 512),
  );
  write(join(ICONS, 'apple-touch-icon-180.png'), await raster(page, icon(PRIMARY, 'iap'), 180, 180));
  write(join(ICONS, 'favicon-32.png'), await raster(page, icon(PRIMARY, 'ifav'), 32, 32));

  console.log('link preview:');
  write(join(ICONS, 'og-image.png'), await ogImage(page, PRIMARY));

  if (previewDir) {
    console.log('previews:');
    const dir = resolve(previewDir);
    await previews(page, dir);
    writeFileSync(join(dir, 'og-primary.png'), await ogImage(page, PRIMARY));
    console.log(`  ${join(dir, 'og-primary.png')}`);
  }

  await browser.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
