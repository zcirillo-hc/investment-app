import { useEffect, useRef, useState } from 'react';
import type { MilestoneKey } from '../domain/triggers';
import { S } from '../content/strings';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface CardProps {
  milestone: MilestoneKey;
  dateLabel: string;
  name: string;
}

const W = 1080;
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/**
 * Visual polish pass, 2026-09-09.
 *
 * These cards exist to be screenshotted and sent, which makes this canvas a piece of the
 * product's face rather than a debug rendering. It is drawn light in both themes on purpose:
 * a share image is an image, and it lands in someone else's thread, not in this app's theme.
 *
 * Every colour is a literal, because a canvas cannot read a CSS custom property, and they are
 * the same brand values the light palette uses. Nothing here is measured by the contrast unit
 * test for that reason, so the two runs of text that carry meaning use the near black ink and
 * the darker coral, not the bright coral, against the light ground they sit on.
 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wraps into at most two lines, shrinking until both fit. Returns the lines and their size. */
function fitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight = 'bold'): { lines: string[]; size: number } {
  for (let size = startSize; size >= 36; size -= 4) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return { lines: [text], size };
    const words = text.split(' ');
    for (let split = words.length - 1; split >= 1; split--) {
      const a = words.slice(0, split).join(' ');
      const b = words.slice(split).join(' ');
      if (ctx.measureText(a).width <= maxWidth && ctx.measureText(b).width <= maxWidth) return { lines: [a, b], size };
    }
  }
  return { lines: [text], size: 36 };
}

function drawJar(ctx: CanvasRenderingContext2D, cx: number, top: number, scale: number) {
  const s = (n: number) => n * scale;
  ctx.save();
  // Cast shadow.
  ctx.fillStyle = 'rgba(22, 112, 63, 0.12)';
  ctx.beginPath();
  ctx.ellipse(cx, top + s(320), s(150), s(20), 0, 0, Math.PI * 2);
  ctx.fill();

  // Lid.
  ctx.fillStyle = '#16703f';
  roundRect(ctx, cx - s(105), top, s(210), s(64), s(22));
  ctx.fill();
  roundRect(ctx, cx - s(125), top + s(56), s(250), s(26), s(13));
  ctx.fill();

  // Body.
  const bodyTop = top + s(82);
  const bodyH = s(224);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx - s(130), bodyTop, s(260), bodyH, s(56));
  ctx.fill();

  // Liquid, clipped to the body.
  ctx.save();
  roundRect(ctx, cx - s(130), bodyTop, s(260), bodyH, s(56));
  ctx.clip();
  const grad = ctx.createLinearGradient(0, bodyTop + bodyH * 0.4, 0, bodyTop + bodyH);
  grad.addColorStop(0, '#f0715a');
  grad.addColorStop(1, '#de9820');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - s(130), bodyTop + bodyH * 0.42, s(260), bodyH);
  // Coins resting in it.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (const [dx, dy, r] of [
    [-56, 176, 34],
    [10, 190, 40],
    [72, 172, 28],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(cx + s(dx), bodyTop + s(dy), s(r), s(r * 0.34), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Glass outline and highlight.
  ctx.strokeStyle = '#16703f';
  ctx.lineWidth = s(14);
  roundRect(ctx, cx - s(130), bodyTop, s(260), bodyH, s(56));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = s(14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s(78), bodyTop + s(56));
  ctx.lineTo(cx - s(78), bodyTop + s(168));
  ctx.stroke();
  ctx.restore();
}

/** Plan 6.14: 1080 x 1080 canvas render, brand colors, big number, mission line, date. */
export function drawMilestone(canvas: HTMLCanvasElement, milestone: MilestoneKey, dateLabel: string, name: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = W;
  canvas.height = W;

  // Ground: one gradient, full bleed. The first version set everything on a white panel
  // inset from the edge, which framed the corners of the gradient and read as a screenshot
  // of a card rather than as a card.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, W);
  bg.addColorStop(0, '#f7fcf9');
  bg.addColorStop(1, '#cfeddd');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, W);

  // Two soft blobs, so the ground is not a flat wash. Both are anchored off the edge, so
  // they read as light rather than as shapes, and neither sits under the centred text.
  ctx.fillStyle = 'rgba(240, 113, 90, 0.18)';
  ctx.beginPath();
  ctx.arc(W + 60, -40, 400, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(222, 152, 32, 0.16)';
  ctx.beginPath();
  ctx.arc(-60, W + 60, 340, 0, Math.PI * 2);
  ctx.fill();

  // A hairline frame, which is what gives the image an edge when it lands in a chat thread
  // on a white background.
  ctx.strokeStyle = 'rgba(22, 112, 63, 0.22)';
  ctx.lineWidth = 4;
  roundRect(ctx, 40, 40, W - 80, W - 80, 64);
  ctx.stroke();

  const cx = W / 2;
  const maxText = W - 240;
  ctx.textAlign = 'center';

  drawJar(ctx, cx, 118, 0.95);

  /*
   * The headline is centred inside a fixed block rather than laid out downwards from a fixed
   * baseline, so a title that needs two lines cannot push the mission line and the wordmark
   * into each other. Everything below it therefore sits at the same place on all three cards.
   */
  const title = fitLines(ctx, S.milestones[milestone], maxText, 86);
  const lineH = title.size + 10;
  const blockTop = 470 + (210 - title.lines.length * lineH) / 2;
  ctx.fillStyle = '#18261e';
  ctx.font = `bold ${title.size}px ${FONT}`;
  title.lines.forEach((lineText, i) => {
    ctx.fillText(lineText, cx, blockTop + i * lineH + title.size * 0.78);
  });

  ctx.fillStyle = '#55655b';
  ctx.font = `40px ${FONT}`;
  ctx.fillText(S.milestones.cardSub[milestone], cx, 730);

  ctx.strokeStyle = 'rgba(22, 112, 63, 0.3)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 90, 786);
  ctx.lineTo(cx + 90, 786);
  ctx.stroke();

  ctx.fillStyle = '#b8330f';
  ctx.font = `bold 46px ${FONT}`;
  ctx.fillText(S.mission, cx, 862);

  ctx.fillStyle = '#55655b';
  ctx.font = `32px ${FONT}`;
  ctx.fillText(`${name ? name + ', ' : ''}${dateLabel}`, cx, 918);

  // Wordmark, bottom centre: a small jar glyph and the name.
  const markY = W - 88;
  ctx.fillStyle = '#16703f';
  roundRect(ctx, cx - 150, markY - 28, 24, 9, 4);
  ctx.fill();
  roundRect(ctx, cx - 155, markY - 21, 34, 38, 12);
  ctx.fill();
  ctx.font = `bold 36px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(S.appName, cx - 108, markY + 8);
  ctx.textAlign = 'center';
}

export function MilestoneCard({ milestone, dateLabel, name }: CardProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    try {
      drawMilestone(canvas.current, milestone, dateLabel, name);
      setUrl(canvas.current.toDataURL('image/png'));
    } catch {
      setUrl(null);
    }
  }, [milestone, dateLabel, name]);
  return (
    <div data-testid={`milestone-${milestone}`} className="flex flex-col items-center gap-3">
      <canvas ref={canvas} className="hidden" aria-hidden="true" />
      {url ? (
        <img src={url} alt={S.milestones[milestone]} className="w-full max-w-[320px] rounded-3xl elev-2 ring-1 ring-line/70" />
      ) : (
        <div className="rounded-2xl bg-leaf-soft p-6 text-center text-lg font-bold">{S.milestones[milestone]}</div>
      )}
      <div className="text-sm text-muted">{S.milestones.reached(dateLabel)}</div>
      {url && (
        <a
          data-testid="milestone-save"
          href={url}
          download={`spare-change-${milestone}.png`}
          className="press inline-flex min-h-[44px] items-center gap-2 rounded-full bg-leaf px-5 font-semibold text-on-leaf elev-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
          </svg>
          {S.milestones.saveImage}
        </a>
      )}
    </div>
  );
}

interface ModalProps {
  items: { milestone: MilestoneKey; dateLabel: string }[];
  name: string;
  onClose: () => void;
}

export function MilestoneModal({ items, name, onClose }: ModalProps) {
  return (
    /*
     * C4-10 (D16): the panel used to run to the bottom of the viewport and pad its own content
     * by `--bottom-inset`, which keeps content clear of the tab bar but not of the demo tray -
     * the tray is `fixed` at `z-50`, so anything scrolled under it (the save control on every
     * card at 375 px) was covered rather than pushed. The inset now shortens the panel itself,
     * so the whole scroll area sits above the tab bar and the tray and nothing can hide under
     * them. `--bottom-inset` is set by the app shell and already includes the tray's height.
     * The `100%` half of the height cap is what the shortened container needs: an 80vh panel in
     * a container that is only 66vh tall would otherwise overflow off the top of the screen.
     */
    <div
      className="pointer-events-none fixed inset-0 z-30 flex items-end justify-center lg:items-center"
      role="presentation"
      /* Plan v2 6.13: plus the home indicator, so the panel's own controls stay reachable. */
      style={{ paddingBottom: 'calc(var(--bottom-inset, 64px) + env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="milestone-modal-title" data-testid="milestone-modal" className="elev-3 pointer-events-auto relative max-h-[min(80vh,100%)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 ring-1 ring-line lg:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="milestone-modal-title" className="text-lg font-extrabold">{S.milestones.title}</h2>
          <Button variant="ghost" size="sm" data-testid="milestone-close" onClick={onClose}>
            {S.common.close}
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyState spot="milestone" title={S.milestones.noneTitle} body={S.milestones.none} className="mb-1" />
        ) : (
          <div className="space-y-7">
            {items.map((it) => (
              <MilestoneCard key={it.milestone} milestone={it.milestone} dateLabel={it.dateLabel} name={name} />
            ))}
            <p className="text-center text-xs text-muted">{S.milestones.share}</p>
          </div>
        )}
      </div>
    </div>
  );
}
