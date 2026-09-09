// CODER suite, cycle 4: the C4-1 persistence mirror and its pagehide / visibilitychange flush guard.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { del, get, set } from 'idb-keyval';
import { STORAGE_KEY } from '../../src/config';
import { MIRROR_KEY, clearMirror, currentRevision, flushMirror, idbStorage, installMirrorFlush } from '../../src/state/persistence';

const ENV = (day: number) => JSON.stringify({ state: { schemaVersion: 1, clock: { dayIndex: day } }, version: 1 });

function mirrorRaw(): string | null {
  return window.localStorage.getItem(MIRROR_KEY);
}

function parsed(raw: string | null | undefined): { rev?: number; state?: { clock: { dayIndex: number } } } {
  return raw ? JSON.parse(raw) : {};
}

describe('C4-1: flush guard runs on pagehide and on visibilitychange (hidden)', () => {
  beforeEach(async () => {
    await del(STORAGE_KEY);
    clearMirror();
  });

  it('fires on pagehide', () => {
    const snapshot = vi.fn(() => ENV(1));
    const off = installMirrorFlush(snapshot);
    expect(snapshot).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(parsed(mirrorRaw()).state?.clock.dayIndex).toBe(1);
    off();
  });

  it('fires on visibilitychange when the document is hidden, and not when it is visible', () => {
    const snapshot = vi.fn(() => ENV(2));
    const off = installMirrorFlush(snapshot);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(snapshot).toHaveBeenCalledTimes(0);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(snapshot).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(snapshot).toHaveBeenCalledTimes(1);
    off();
  });

  it('stops listening once uninstalled', () => {
    const snapshot = vi.fn(() => ENV(3));
    installMirrorFlush(snapshot)();
    window.dispatchEvent(new Event('pagehide'));
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('a snapshot that throws does not escape the flush', () => {
    expect(() =>
      flushMirror(() => {
        throw new Error('state unreadable');
      }),
    ).not.toThrow();
  });
});

describe('C4-1: the mirror is written on every change and only wins when it is provably newer', () => {
  beforeEach(async () => {
    await del(STORAGE_KEY);
    clearMirror();
  });

  it('every write mirrors synchronously and stamps a rising revision', async () => {
    const before = currentRevision();
    const p = idbStorage.setItem(STORAGE_KEY, ENV(1));
    // Synchronous: the mirror is already there, in the same tick, before the idb write settles.
    expect(parsed(mirrorRaw()).state?.clock.dayIndex).toBe(1);
    expect(parsed(mirrorRaw()).rev).toBe(before + 1);
    await p;
    await idbStorage.setItem(STORAGE_KEY, ENV(2));
    expect(parsed(mirrorRaw()).rev).toBe(before + 2);
    expect(parsed(await get<string>(STORAGE_KEY)).state?.clock.dayIndex).toBe(2);
  });

  it('hydrates from the mirror when the IndexedDB record is a revision behind, and repairs it', async () => {
    await idbStorage.setItem(STORAGE_KEY, ENV(4));
    const stale = await get<string>(STORAGE_KEY);
    // Simulate the lost write: the mirror advances, IndexedDB keeps the older revision.
    flushMirror(() => ENV(5));
    await set(STORAGE_KEY, stale!);

    const read = await idbStorage.getItem(STORAGE_KEY);
    expect(parsed(read).state?.clock.dayIndex).toBe(5);
    // Repaired before rendering: IndexedDB now holds the recovered value too.
    expect(parsed(await get<string>(STORAGE_KEY)).state?.clock.dayIndex).toBe(5);
  });

  it('does not resurrect state when IndexedDB has no record, and drops the stale mirror', async () => {
    await idbStorage.setItem(STORAGE_KEY, ENV(6));
    await del(STORAGE_KEY);
    expect(mirrorRaw()).not.toBeNull();
    // A wiped database plus a reload: the in-memory fallback map is gone with the page, so
    // re-import the module to get the boot state a real reload would have.
    vi.resetModules();
    const fresh = await import('../../src/state/persistence');
    expect(await fresh.idbStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(mirrorRaw()).toBeNull();
  });

  it('trusts a record written outside the adapter (no revision) over the mirror', async () => {
    await idbStorage.setItem(STORAGE_KEY, ENV(7));
    await set(STORAGE_KEY, ENV(99)); // hand-written envelope, no rev
    const read = await idbStorage.getItem(STORAGE_KEY);
    expect(parsed(read).state?.clock.dayIndex).toBe(99);
  });

  it('removeItem clears the mirror, so Reset demo leaves nothing behind', async () => {
    await idbStorage.setItem(STORAGE_KEY, ENV(8));
    await idbStorage.removeItem(STORAGE_KEY);
    expect(mirrorRaw()).toBeNull();
    expect(await idbStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('a corrupt mirror is ignored rather than thrown on', async () => {
    await idbStorage.setItem(STORAGE_KEY, ENV(9));
    window.localStorage.setItem(MIRROR_KEY, '{not json');
    const read = await idbStorage.getItem(STORAGE_KEY);
    expect(parsed(read).state?.clock.dayIndex).toBe(9);
  });

  it('an unchanged flush keeps its revision, so it never overrides a good record', async () => {
    await idbStorage.setItem(STORAGE_KEY, ENV(10));
    const rev = parsed(mirrorRaw()).rev;
    flushMirror(() => ENV(10));
    expect(parsed(mirrorRaw()).rev).toBe(rev);
  });
});
