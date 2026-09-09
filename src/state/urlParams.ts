import { isValidDate } from '../domain/dates';
import type { PushSupportState } from '../domain/types';

// Plan v2 section 5.4: ?demo=1, ?freeze=1, ?start=YYYY-MM-DD, ?seed=<int>, ?nudge=1.
// Read once at boot.
export interface UrlParams {
  demo: boolean;
  freeze: boolean;
  start: string | null;
  seed: number | null;
  /** Forces the next nudge due now, once, at boot, so one navigation can reach a nudge. */
  nudge: boolean;
  /**
   * Test and demo only. Forces `supportState()` so the four Nudges card panels of plan 8.10
   * can be rendered on demand: axe has to reach all four (criterion 17), and there is no other
   * way to make one Chromium profile look like an iPhone Safari tab and a denied browser in
   * the same run. It never changes what the app does with a real subscription.
   */
  push: PushSupportState | null;
}

const PUSH_STATES: PushSupportState[] = ['ready', 'needs-ios-install', 'denied', 'unsupported', 'unknown'];

export function parseUrlParams(search: string): UrlParams {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const start = q.get('start');
  const seedRaw = q.get('seed');
  const seed = seedRaw !== null && /^-?\d+$/.test(seedRaw.trim()) ? Number(seedRaw.trim()) >>> 0 : null;
  return {
    demo: q.get('demo') === '1',
    freeze: q.get('freeze') === '1',
    start: start && isValidDate(start) ? start : null,
    seed,
    nudge: q.get('nudge') === '1',
    push: PUSH_STATES.includes(q.get('push') as PushSupportState) ? (q.get('push') as PushSupportState) : null,
  };
}

let cached: UrlParams | null = null;

export function getUrlParams(): UrlParams {
  if (cached === null) {
    cached = parseUrlParams(typeof window !== 'undefined' ? window.location.search : '');
  }
  return cached;
}

/** Test hook. */
export function overrideUrlParams(p: UrlParams | null): void {
  cached = p;
}
