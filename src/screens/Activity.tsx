import { useMemo } from 'react';
import { useAppStore } from '../state/store';
import { S } from '../content/strings';
import { Screen, ScreenTitle } from '../components/Screen';
import { Card } from '../components/Card';
import { RichText } from '../components/Term';
import { EmptyState } from '../components/EmptyState';
import { formatDateLongSafe } from '../domain/dates';
import type { LedgerEvent } from '../domain/types';

/** Plan v2 section 8.3: RoundUp, Catch, Skip, JarMove, JarEmptied. Purchases and Paychecks stay out. */
type FeedEvent = Extract<LedgerEvent, { kind: 'RoundUp' | 'Catch' | 'Skip' | 'JarMove' | 'JarEmptied' }>;

function line(e: FeedEvent): string {
  switch (e.kind) {
    case 'RoundUp':
      return S.activity.roundUp(e.merchant, e.purchaseCents, e.cents);
    case 'Catch':
      return S.activity.catch(e.paycheckCents, e.cents);
    case 'Skip':
      // R11.3: the display name comes off the event, so a deleted place never erases this line.
      return S.activity.skip(e.displayName, e.cents);
    case 'JarMove':
      return S.activity.jarMove(e.cents);
    case 'JarEmptied':
      // R6.5: neutral. No disapproving copy anywhere on this line.
      return S.activity.jarEmptied(e.cents);
  }
}

/**
 * Visual polish pass, 2026-09-09. The five kinds used to be told apart by a 10 px dot, which
 * is colour alone. Each now has a glyph as well, on a tinted badge, so the kind survives both
 * a colour vision difference and a screenshot at phone scale. The kind's name is still
 * printed in words above every line, which is what actually carries it.
 */
const KIND_SKIN: Record<FeedEvent['kind'], { badge: string; glyph: string; icon: string }> = {
  RoundUp: { badge: 'bg-amber-soft', glyph: 'text-amber-ink', icon: 'M12 19V5M6 11l6-6 6 6' },
  Catch: { badge: 'bg-coral-soft', glyph: 'text-coral-ink', icon: 'M4 8.5h16v9H4zM12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  Skip: { badge: 'bg-leaf-soft', glyph: 'text-leaf', icon: 'M5 12.5l4.5 4.5L19 7' },
  JarMove: { badge: 'bg-leaf-soft', glyph: 'text-leaf', icon: 'M4 12h13M12.5 6.5L19 12l-6.5 5.5' },
  JarEmptied: { badge: 'bg-ground', glyph: 'text-muted', icon: 'M6 7.5h12l-1 12.5H7zM9.5 7.5V5h5v2.5' },
};

const FEED_KINDS: FeedEvent['kind'][] = ['RoundUp', 'Catch', 'Skip', 'JarMove', 'JarEmptied'];

export function Activity() {
  const events = useAppStore((s) => s.events);
  const groups = useMemo(() => {
    const feed = events.filter((e): e is FeedEvent => (FEED_KINDS as string[]).includes(e.kind));
    const byDate = new Map<string, FeedEvent[]>();
    for (const e of feed) {
      const list = byDate.get(e.date) ?? [];
      list.push(e);
      byDate.set(e.date, list);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, list]) => ({ date, list: list.slice().reverse() }));
  }, [events]);

  return (
    <Screen id="activity">
      <ScreenTitle title={S.activity.title} sub={<RichText text={S.activity.sub} />} />
      {groups.length === 0 ? (
        <EmptyState className="mt-4" spot="activity" testId="activity-empty" title={S.activity.emptyTitle} body={S.activity.empty} />
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map((g) => (
            <section key={g.date}>
              <h2 className="mb-2 inline-flex rounded-full bg-ground px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted ring-1 ring-line/60">
                {formatDateLongSafe(g.date)}
              </h2>
              <Card padded={false}>
                <ul className="divide-y divide-line/60">
                  {g.list.map((e) => (
                    <li key={e.id} data-testid="activity-item" data-kind={e.kind} className="flex items-start gap-3 px-4 py-3.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${KIND_SKIN[e.kind].badge}`} aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={KIND_SKIN[e.kind].glyph} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={KIND_SKIN[e.kind].icon} />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{S.activity.kindLabel[e.kind]}</div>
                        <div data-testid={`activity-item-${e.kind}`} className="mt-0.5 text-[15px] leading-snug">
                          <RichText text={line(e)} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </Screen>
  );
}
