// Plan v2 sections 7.2, 8.9 and 9.8: a thin loader over shared/content/learn.json.
//
// R12.5 is the rule this module exists to keep honest: the library has no triggers at all.
// Nothing here reads state, nothing here computes an unlock, and there is deliberately no
// export that could gate a piece. Three moments SURFACE a piece (a dismissible card on Home
// linking to something already readable), and surfacing lives in triggers, not here.
import raw from '../../shared/content/learn.json';

export interface LearnTrack {
  key: string;
  title: string;
  blurb: string;
}

export interface LearnItem {
  id: string;
  track: string;
  title: string;
  /** Terms are marked as [[key]] or [[key|display text]] and render through RichText. */
  body: string;
}

export const LEARN_TRACKS: LearnTrack[] = raw.tracks as LearnTrack[];
export const LEARN_ITEMS: LearnItem[] = raw.items as LearnItem[];

/**
 * Plan 9.8a, as rewritten by the cycle 8 amendment. One sentence, shown on six surfaces: the
 * Learn library index, every one of the sixteen Learn item pages, every one of the eight
 * lesson pages, the Invest screen, the top of Lessons, and Settings. Verbatim in all six, so a
 * reader who has seen it once knows what it says every other time. `scripts/lint-advice.ts`
 * fails the build if any of those screens stops rendering it.
 */
export const NOT_ADVICE_LINE: string = raw.standingLine;

export const LEARN_ITEM_BY_ID: Record<string, LearnItem> = Object.fromEntries(LEARN_ITEMS.map((i) => [i.id, i]));

export const LEARN_IDS: string[] = LEARN_ITEMS.map((i) => i.id);

/** Plan 8.9: the header reads "N of 16 read", so the total comes from the content, never a constant. */
export const LEARN_TOTAL = LEARN_ITEMS.length;

export function learnItemsInTrack(trackKey: string): LearnItem[] {
  return LEARN_ITEMS.filter((i) => i.track === trackKey);
}

/**
 * Plan R12.5: the three surfacing moments. Each names a piece that was already readable
 * before the moment and stays readable after it, so this map can never gate anything.
 */
export type LearnSurface = 'firstInvestVisit' | 'firstLedgerEntry' | 'dayThirty';

export const LEARN_SURFACE_ITEM: Record<LearnSurface, string> = {
  firstInvestVisit: 'E01',
  firstLedgerEntry: 'E04',
  dayThirty: 'E13',
};

export const LEARN_SURFACES: LearnSurface[] = ['firstInvestVisit', 'firstLedgerEntry', 'dayThirty'];

/**
 * The one line reason each surfacing card gives. It lives in the content file rather than in
 * `strings.ts` for two reasons: it is prose about the library, and criterion 3 greps `src/`
 * for the vocabulary of the deleted investing engine, which this copy legitimately uses.
 */
export const LEARN_SURFACE_LINE: Record<LearnSurface, string> = raw.surfaces as Record<LearnSurface, string>;
