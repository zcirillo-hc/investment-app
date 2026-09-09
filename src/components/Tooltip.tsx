import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { S } from '../content/strings';

interface Props {
  text: string;
  children: ReactNode;
  testId?: string;
  /** The visible term, used only to name the anchor for assistive tech (C4-4). */
  label?: string;
}

/** Gap between the anchor and the bubble, and the minimum breathing room at a viewport edge. */
const GAP = 8;
const EDGE = 8;
const SIDE = 12;
const MAX_WIDTH = 260;

/**
 * Only one bubble is ever open (D6). Instances subscribe to a module-level "who is open"
 * value; opening one closes every other.
 */
let openId: string | null = null;
const listeners = new Set<() => void>();
function setOpenTooltip(id: string | null) {
  openId = id;
  for (const l of listeners) l();
}

type Placement = 'below' | 'above';

/**
 * Plan 6, "Global components". Opens on hover, focus or tap; a tap pins it. Closes on
 * Escape, an outside pointerdown, blur of the anchor, or a route change (the screen
 * unmounts). A scroll REPOSITIONS the bubble so it keeps following its anchor, and never
 * closes it: the previous close-on-any-scroll rule made a tap low in the viewport close its
 * own bubble, because inserting the portalled bubble past the viewport bottom makes the
 * browser emit a scroll event (D11). The bubble flips above the anchor when there is no room
 * below and is clamped inside the viewport horizontally and vertically.
 */
export function Tooltip({ text, children, testId, label }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Hover and focus open softly; a tap or click pins the bubble until Escape, an outside tap,
  // focus leaving the term, or another term opening.
  const pinned = useRef(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  // Timestamp of the event that opened this bubble. Anything at or before it belongs to the
  // opening interaction and must never close it (plan 6).
  const openedAt = useRef(0);
  /**
   * C4-9 (D13). Escape hands focus back to the anchor, and `focus()` fires the anchor's own
   * `onFocus`, which would re-open the bubble it just closed when the tooltip was opened by
   * hover (focus was elsewhere, so the call is not a no-op). This latch is raised only around
   * that programmatic `focus()` call and is cleared immediately after it, so a later real
   * focus-in from Tab or a click still opens the tooltip as before.
   */
  const refocusing = useRef(false);
  const [pos, setPos] = useState<{ left: number; top: number; placement: Placement }>({ left: 0, top: 0, placement: 'below' });

  const close = useCallback(() => {
    pinned.current = false;
    setOpen(false);
    if (openId === id) setOpenTooltip(null);
  }, [id]);

  const show = useCallback(
    (pin: boolean, at?: number) => {
      pinned.current = pin;
      openedAt.current = at ?? performance.now();
      setOpen(true);
      setOpenTooltip(id);
    },
    [id],
  );

  /**
   * Places the bubble against the anchor's current position. Called once when it opens and
   * again on every scroll or resize while it is open, so it tracks the anchor instead of
   * floating away from it. The bubble's width comes from CSS (`width` plus a viewport
   * `maxWidth`), so a single measuring pass is enough and this never oscillates.
   */
  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const b = bubble.current?.getBoundingClientRect();
    if (!a) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = b?.width ?? Math.min(MAX_WIDTH, vw - SIDE * 2);
    const height = b?.height ?? 0;

    let left = a.left + a.width / 2 - width / 2;
    left = Math.max(SIDE, Math.min(vw - width - SIDE, left));

    let placement: Placement = 'below';
    let top = a.bottom + GAP;
    const fitsBelow = top + height + EDGE <= vh;
    const fitsAbove = a.top - GAP - height >= EDGE;
    if (!fitsBelow && fitsAbove) {
      placement = 'above';
      top = a.top - GAP - height;
    }
    // Whatever side it lands on, keep it inside the viewport.
    top = Math.max(EDGE, Math.min(Math.max(EDGE, vh - height - EDGE), top));

    setPos((p) => (p.left === left && p.top === top && p.placement === placement ? p : { left, top, placement }));
  }, []);

  // Another Tooltip opened: close this one.
  useEffect(() => {
    const on = () => {
      if (openId !== id) {
        pinned.current = false;
        setOpen(false);
      }
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
      if (openId === id) openId = null;
    };
  }, [id]);

  // Runs before paint, in the same commit that mounted the bubble, so it is never seen at 0,0.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, text]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      // The pointerdown that opened this bubble must not also close it.
      if (e.timeStamp <= openedAt.current) return;
      const t = e.target as Node;
      if (anchor.current?.contains(t) || bubble.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      // C4-4: Escape closes and hands focus back to the term it came from, so a keyboard or
      // screen-reader user is not dropped at the top of the document.
      if (e.key === 'Escape') {
        close();
        // The latch must survive only this call: `focus()` dispatches `focusin` synchronously,
        // so the anchor's `onFocus` has already run (and been suppressed) by the next line.
        refocusing.current = true;
        try {
          anchor.current?.focus();
        } finally {
          refocusing.current = false;
        }
      }
    };
    const onMove = () => place();
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    // Capturing, so a scroll inside any container (the holdings table, a sheet) repositions too.
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close, place]);

  const toggle = (at?: number) => {
    if (open && pinned.current) close();
    else show(true, at);
  };

  return (
    <>
      <span
        ref={anchor}
        role="button"
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        // C4-4: the term itself names the control; the hint follows it, so a screen reader
        // announces "Round-ups, Tap for a quick explanation" instead of 29 identical hints.
        aria-label={label ? `${label}, ${S.common.tooltipHint}` : S.common.tooltipHint}
        data-testid={testId}
        data-term-open={open ? 'true' : undefined}
        data-term-placement={open ? pos.placement : undefined}
        // py-[3px] lifts the inline hit area toward the 24 px goal in the revised plan 11
        // without making the span inline-block, which would stop long terms wrapping.
        className="cursor-help rounded-sm py-[3px] underline decoration-dotted decoration-leaf underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf"
        onClick={(e) => {
          e.stopPropagation();
          // Pass the click's own timestamp along: the follow-on scroll or pointer event that
          // the same tap produces is then recognised as part of the opening interaction.
          toggle(e.timeStamp);
        }}
        onMouseEnter={() => {
          if (!open) show(false);
        }}
        onMouseLeave={() => {
          if (!pinned.current) close();
        }}
        onFocus={(e) => {
          // C4-9: the focus Escape just handed back must not re-open what Escape closed.
          if (refocusing.current) return;
          show(pinned.current, e.timeStamp);
        }}
        // A pinned bubble used to outlive focus and the pointer (D6). Focus leaving the
        // term always closes it, pinned or not.
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle(e.timeStamp);
          }
        }}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <span
            ref={bubble}
            id={id}
            role="tooltip"
            data-testid="tooltip-bubble"
            data-placement={pos.placement}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: MAX_WIDTH,
              maxWidth: `calc(100vw - ${SIDE * 2}px)`,
              zIndex: 80,
            }}
            className="block rounded-2xl bg-ink px-3.5 py-2.5 text-sm leading-snug text-ground elev-3 dark:bg-card dark:text-ink dark:ring-1 dark:ring-line"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
