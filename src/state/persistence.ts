import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';
import type { AppState, LedgerEntry } from '../domain/types';
import { STORAGE_KEY } from '../config';
import { validateImportedState } from './validate';
import { tidyLedger } from '../domain/ledger';

export { validateImportedState } from './validate';
export type { ValidationResult } from './validate';

// Plan v2 section 5.3: the persistence layer is not restructured. Only the storage key and
// the schema version change, and both come from config.
// idb-keyval storage with an in-memory fallback (private browsing etc.).
const memory = new Map<string, string>();
let fallback = false;

export function isStorageFallback(): boolean {
  return fallback;
}

/**
 * C4-1, persistence write race. IndexedDB stays the store of record, but every write to it is
 * asynchronous, so a reload a few milliseconds after an action could land before the write
 * settled and silently drop that action. Every write is therefore also mirrored to
 * localStorage synchronously, in the same tick as the state change, and each write stamps a
 * monotonically increasing revision into the persisted envelope (`{"rev":N,"state":...}`).
 *
 * On boot the two are compared and the mirror is used only when it can be *proved* newer:
 * the IndexedDB record must exist, carry a revision, and carry a lower one. If IndexedDB has
 * no record at all the mirror is discarded rather than replayed, because "no record" means
 * the store of record was cleared (Reset demo, a wiped database, a fresh profile), not that a
 * write was lost. A record with no revision was not written by this adapter (a hand-edited or
 * older envelope) and is likewise trusted as-is.
 */
export const MIRROR_KEY = 'spare-change-state-mirror';

let rev = 0;
let lastWritten: string | null = null;
/**
 * The import path writes the envelope straight to storage and then reloads, deliberately
 * leaving the in-memory store stale. Nothing after that point may write again: without this,
 * the `pagehide` flush that the reload itself fires would mirror the pre-import store over
 * the file the user just imported.
 */
let frozen = false;

export function freezePersistence(): void {
  frozen = true;
}

/** A rehydrate or a cleared store is a new life for the page (and for a test). */
function unfreeze(): void {
  frozen = false;
}

/** `{"state":...}` -> `{"rev":N,"state":...}`, without paying a parse on every write. */
function stamp(value: string, r: number): string {
  return value.startsWith('{') ? `{"rev":${r},${value.slice(1)}` : value;
}

function revOf(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const r = (JSON.parse(raw) as { rev?: unknown }).rev;
    return typeof r === 'number' && Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}

function readMirror(): string | null {
  try {
    return window.localStorage.getItem(MIRROR_KEY);
  } catch {
    return null;
  }
}

/** Synchronous, never throws: a blocked or full localStorage must not break a state change. */
function writeMirror(raw: string): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, raw);
  } catch {
    /* storage blocked or full; IndexedDB is still the store of record */
  }
}

export function clearMirror(): void {
  try {
    window.localStorage.removeItem(MIRROR_KEY);
  } catch {
    /* ignore */
  }
}

/** Test and boot hook: the revision the next write will use. */
export function currentRevision(): number {
  return rev;
}

export const idbStorage: StateStorage = {
  async getItem(name) {
    unfreeze();
    let stored: string | null;
    try {
      stored = (await get<string>(name)) ?? memory.get(name) ?? null;
    } catch {
      fallback = true;
      stored = memory.get(name) ?? null;
    }
    const mirror = name === STORAGE_KEY ? readMirror() : null;
    const storedRev = revOf(stored);
    const mirrorRev = revOf(mirror);
    // Keep the counter monotonic across sessions, or a fresh page's rev 1 would look older
    // than the previous session's rev 12 and a lost write would resolve the wrong way.
    rev = Math.max(rev, storedRev ?? 0, mirrorRev ?? 0);
    if (stored === null) {
      // The store of record is gone. Discard the mirror instead of resurrecting state.
      if (mirror !== null) clearMirror();
      return null;
    }
    if (mirror !== null && mirrorRev !== null && storedRev !== null && mirrorRev > storedRev) {
      // The last IndexedDB write never landed. Recover, and put it back before rendering.
      memory.set(name, mirror);
      lastWritten = mirror;
      try {
        await set(name, mirror);
      } catch {
        fallback = true;
      }
      return mirror;
    }
    return stored;
  },
  async setItem(name, value) {
    if (frozen) return;
    const raw = name === STORAGE_KEY ? stamp(value, ++rev) : value;
    memory.set(name, raw);
    if (name === STORAGE_KEY) {
      lastWritten = raw;
      writeMirror(raw);
    }
    try {
      await set(name, raw);
    } catch {
      fallback = true;
    }
  },
  async removeItem(name) {
    unfreeze();
    memory.delete(name);
    if (name === STORAGE_KEY) {
      lastWritten = null;
      clearMirror();
    }
    try {
      await del(name);
    } catch {
      fallback = true;
    }
  },
};

/**
 * C4-1 flush guard. `pagehide` and a `visibilitychange` to hidden are the last moments a
 * backgrounded or closing tab is guaranteed to run script, so the mirror is rewritten from
 * the live store there in case a change landed after the last mirror write. Exported for the
 * unit test; `installMirrorFlush` wires it to the real events.
 */
export function flushMirror(snapshot: () => string): void {
  if (frozen) return;
  let raw: string;
  try {
    raw = snapshot();
  } catch {
    return;
  }
  // Same payload as the last write: keep its revision, so an unchanged flush never makes the
  // mirror look newer than a perfectly good IndexedDB record.
  if (lastWritten !== null && stamp(raw, revOf(lastWritten) ?? rev) === lastWritten) {
    writeMirror(lastWritten);
    return;
  }
  const next = stamp(raw, ++rev);
  lastWritten = next;
  memory.set(STORAGE_KEY, next);
  writeMirror(next);
}

/** Returns an uninstaller (used by tests). */
export function installMirrorFlush(snapshot: () => string, target: EventTarget = window, doc: Document = document): () => void {
  const onPageHide = () => flushMirror(snapshot);
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') flushMirror(snapshot);
  };
  target.addEventListener('pagehide', onPageHide);
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    target.removeEventListener('pagehide', onPageHide);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}

const APP_STATE_KEYS: (keyof AppState)[] = [
  'schemaVersion',
  'profile',
  'settings',
  'clock',
  'jarCents',
  'places',
  'visits',
  'habits',
  'nudges',
  'ledger',
  'events',
  'pendingPaychecks',
  'lessons',
  'learn',
  'learnSurfaces',
  'milestones',
  'flags',
  'push',
  'demo',
];

/** partialize: only the AppState fields, never actions or UI state. */
export function pickAppState(source: AppState): AppState {
  const out = {} as Record<string, unknown>;
  for (const k of APP_STATE_KEYS) out[k] = source[k];
  return out as unknown as AppState;
}

/**
 * Plan v2 5.5: `push` is device state, not user data. It is persisted locally so a reload does
 * not forget that this browser is subscribed, but it is stripped from an export, because the
 * endpoint hash identifies one browser durably (risk 5) and an export is a file the user may
 * hand to someone else. The import validator drops it too, so the round trip is symmetrical.
 */
export function exportStateJson(state: AppState): string {
  const { push: _push, ...rest } = pickAppState(state);
  return JSON.stringify(rest, null, 2);
}

/**
 * `looksLikeExport` (V2-21): true when the file parsed and carries this version's schema but a
 * field failed a check. Only a file that is not an export may be told it is not one.
 * `section` (V2-29): the letters of the top level key that failed, such as `ledger`, and
 * nothing else from the file. The screen maps it to fixed words; it is never shown as is.
 */
export type ImportResult =
  | { ok: true; state: AppState; tidied: number }
  | { ok: false; error: string; problems: string[]; looksLikeExport: boolean; section: string };

/**
 * Plan 5.4 (Cycle 2): full shape and range validation via `validateImportedState`.
 * Malformed input leaves state untouched and returns the list of problems.
 */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json', problems: ['root: not valid JSON'], looksLikeExport: false, section: '' };
  }
  const r = validateImportedState(raw);
  if (!r.ok) {
    const first = r.problems[0] ?? '';
    const looksLikeExport =
      !first.startsWith('root') && !first.startsWith('schemaVersion') && !r.problems.every((p) => p.endsWith(': missing'));
    return { ok: false, error: first || 'invalid', problems: r.problems, looksLikeExport, section: /^[A-Za-z]+/.exec(first)?.[0] ?? '' };
  }
  return { ok: true, state: r.state, tidied: r.tidied };
}

/** Writes an AppState directly into the persist envelope so a reload picks it up. */
/**
 * The zustand persist version. 2 (2026-09-11): loading a version 1 envelope tidies its ledger
 * once (R16.8), so rows an earlier build saved never block an edit or an export.
 */
export const PERSIST_VERSION = 2;

const TIDY_NOTICE_KEY = 'sc-tidy-notice';

/** R16.8: kept across the reload that follows an import or a migration, then said once. */
export function noteTidied(n: number): void {
  try {
    sessionStorage.setItem(TIDY_NOTICE_KEY, String(n));
  } catch {
    // Storage blocked: the notice is lost, the tidy is not.
  }
}

export function takeTidyNotice(): number {
  try {
    const n = Number(sessionStorage.getItem(TIDY_NOTICE_KEY) ?? 0);
    sessionStorage.removeItem(TIDY_NOTICE_KEY);
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * R16.8 and V2-27: zustand's `migrate` for a persisted envelope. A version 1 ledger is tidied
 * once. If anything in it cannot be read, the state comes back exactly as stored instead of
 * throwing: a throw here makes zustand boot on the initial state, and its next write would
 * erase everything the user had.
 */
export function migratePersisted(persisted: unknown, version: number): unknown {
  if (version >= PERSIST_VERSION) return persisted;
  try {
    const p = persisted as { ledger?: unknown } | null;
    if (!p || !Array.isArray(p.ledger)) return persisted;
    // V2-30: one row at a time, so a row that cannot be read is kept exactly as stored and
    // does not stop every other row from being tidied.
    let tidied = 0;
    const ledger = p.ledger.map((row: unknown) => {
      try {
        const t = tidyLedger([row as LedgerEntry]);
        tidied += t.tidied;
        return t.ledger[0];
      } catch {
        return row;
      }
    });
    if (tidied === 0) return persisted;
    noteTidied(tidied);
    return { ...p, ledger };
  } catch {
    return persisted;
  }
}

export async function writeImportedState(state: AppState, tidied = 0): Promise<void> {
  const envelope = { state: pickAppState(state), version: PERSIST_VERSION };
  if (tidied > 0) noteTidied(tidied);
  await idbStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  // The caller reloads next; the running store still holds the pre-import state (C4-1).
  freezePersistence();
}

export async function clearPersistedState(): Promise<void> {
  await idbStorage.removeItem(STORAGE_KEY);
}

export async function readPersistedEnvelope(): Promise<{ state: AppState; version: number } | null> {
  const raw = await idbStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { state: AppState; version: number };
  } catch {
    return null;
  }
}
