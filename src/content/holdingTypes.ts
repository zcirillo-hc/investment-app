// Plan v2 sections 1.2, 7.2 and 8.7a: a thin loader over shared/content/holdingTypes.json.
// These are the six labels the invest capture offers. They are not quiz questions and nothing
// is computed from the choice; the label becomes a ledger entry's `what` field and no more.
import raw from '../../shared/content/holdingTypes.json';

export interface HoldingType {
  key: string;
  label: string;
  requiresLabel: boolean;
  /**
   * R18. A neutral one line answer to "what is this". Identical for every user no matter what
   * they hold, because R15.4 forbids educational content that varies with the ledger. It says
   * what the thing is and never whether it is a good idea.
   */
  what: string;
  /** R18. The Learn piece that goes deeper on this type. */
  learnId: string;
}

export const HOLDING_TYPES: HoldingType[] = raw.holdingTypes as HoldingType[];

export const HOLDING_TYPE_BY_KEY: Record<string, HoldingType> = Object.fromEntries(HOLDING_TYPES.map((h) => [h.key, h]));

/**
 * R7.1: the free text suggestion list on the ledger form itself (plan 8.7). It is a superset
 * of the capture chips and is only ever a suggestion; `what` is never validated against it.
 */
export const LEDGER_WHAT_SUGGESTIONS: string[] = [
  'Index fund',
  'ETF',
  'Retirement account',
  'Savings account',
  'Individual stock',
  'Crypto',
  'Something else',
];
