import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../state/store';
import { useUiStore } from '../state/uiStore';
import { useAppNavigate } from '../lib/hooks';
import { S } from '../content/strings';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SummerCurves } from '../components/SummerCurves';
import { RichText } from '../components/Term';
import { parseDollarInput } from '../domain/money';
import { keepOfLeftCents, summerCurves } from '../domain/summer';
import { DEFAULT_AGE, MAX_AGE, MIN_AGE } from '../config';

/**
 * Plan v2 8.5 and 6.13. One screen, two contexts: the third onboarding step at
 * `/onboarding/summer`, and a revisit at `/summer` reached from the Home summer card. The
 * revisit saves and returns instead of continuing to the fear check, and gets the header's
 * back control from `backControlFor` rather than the onboarding Back button.
 */
export function SummerMoney() {
  const profile = useAppStore((s) => s.profile);
  const setSummer = useAppStore((s) => s.setSummer);
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useAppNavigate();
  const revisit = useLocation().pathname === '/summer';
  const [earned, setEarned] = useState(profile.summerEarnedCents !== null ? String(profile.summerEarnedCents / 100) : '');
  const [left, setLeft] = useState(profile.summerLeftCents !== null ? String(profile.summerLeftCents / 100) : '');
  const [age, setAge] = useState(profile.age || DEFAULT_AGE);

  const earnedCents = parseDollarInput(earned);
  const leftCents = parseDollarInput(left);
  const curves = useMemo(() => summerCurves(earnedCents), [earnedCents]);
  const data = useMemo(() => curves.ages.map((a, i) => ({ age: a, now: Math.round(curves.startNow[i]), later: Math.round(curves.startAt30[i]) })), [curves]);
  const ages: number[] = [];
  for (let a = MIN_AGE; a <= MAX_AGE; a++) ages.push(a);

  return (
    <Screen id="summer" className="pt-6">
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-3xl">{S.summer.title}</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">{S.summer.earnedLabel}</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted">$</span>
            <input
              data-testid="summer-earned"
              inputMode="decimal"
              className="w-full rounded-2xl bg-card py-3 pl-8 pr-4 text-lg font-bold ring-1 ring-line transition num elev-1 focus:outline-none focus:ring-2 focus:ring-leaf"
              value={earned}
              placeholder="3,000"
              onChange={(e) => setEarned(e.target.value)}
            />
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{S.summer.leftLabel}</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted">$</span>
            <input
              data-testid="summer-left"
              inputMode="decimal"
              className="w-full rounded-2xl bg-card py-3 pl-8 pr-4 text-lg font-bold ring-1 ring-line transition num elev-1 focus:outline-none focus:ring-2 focus:ring-leaf"
              value={left}
              placeholder="500"
              onChange={(e) => setLeft(e.target.value)}
            />
          </div>
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-semibold">{S.summer.ageLabel}</span>
        <select
          data-testid="summer-age"
          className="mt-1 w-full rounded-2xl bg-card px-4 py-3 text-lg ring-1 ring-line transition elev-1 focus:outline-none focus:ring-2 focus:ring-leaf sm:w-40"
          value={age}
          onChange={(e) => setAge(Number(e.target.value))}
        >
          {ages.map((a) => (
            <option key={a} value={a}>
              {S.summer.ageOption(a)}
            </option>
          ))}
        </select>
      </label>
      {curves.usedDefault && (
        <p className="mt-3 text-sm font-semibold text-amber-ink" data-testid="summer-default-note">
          {S.summer.defaultNote}
        </p>
      )}
      <Card className="mt-5">
        <h2 className="text-sm font-semibold text-muted">{S.summer.chartTitle}</h2>
        <div data-testid="summer-chart" style={{ width: '100%', height: 220 }} className="mt-2">
          <SummerCurves data={data} />
        </div>
        <p className="mt-3 text-lg font-bold" data-testid="summer-diff" data-now={Math.round(curves.endNow)} data-later={Math.round(curves.endAt30)}>
          <RichText text={S.summer.headline(curves.diff, curves.extraPutIn)} />
        </p>
        <p className="mt-1 text-sm text-muted">
          <RichText text={S.summer.assumption} />
        </p>
      </Card>
      {leftCents !== null && leftCents > 0 && (
        <p className="mt-4 text-base" data-testid="summer-left-line">
          {S.summer.leftLine(keepOfLeftCents(leftCents))}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        {revisit ? (
          <Button
            size="lg"
            className="flex-1"
            data-testid="summer-save"
            onClick={() => {
              setSummer(earnedCents, leftCents, age);
              showToast(S.summer.saved);
              navigate('/');
            }}
          >
            {S.summer.saveChanges}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => navigate('/welcome')}>
              {S.common.back}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              data-testid="summer-continue"
              onClick={() => {
                setSummer(earnedCents, leftCents, age);
                navigate('/onboarding/fear');
              }}
            >
              {S.common.continue}
            </Button>
          </>
        )}
      </div>
    </Screen>
  );
}
