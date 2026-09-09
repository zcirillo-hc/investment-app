import { useState } from 'react';
import { useAppStore } from '../state/store';
import { useAppNavigate } from '../lib/hooks';
import { S } from '../content/strings';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import type { FearOption } from '../domain/types';

const OPTIONS: FearOption[] = ['rent', 'pointless', 'confused', 'losing'];

export function FearCheck() {
  const existing = useAppStore((s) => s.profile.fear);
  const setFear = useAppStore((s) => s.setFear);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const navigate = useAppNavigate();
  const [picked, setPicked] = useState<FearOption | null>(existing);
  return (
    <Screen id="fear" className="pt-6">
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-3xl">{S.fear.question}</h1>
      <p className="mt-2 leading-snug text-muted">{S.fear.sub}</p>
      <div className="mt-6 grid gap-3" role="radiogroup" aria-label={S.fear.question}>
        {OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={picked === o}
            data-testid={`fear-option-${o}`}
            onClick={() => setPicked(o)}
            className={`press flex min-h-[64px] w-full items-center gap-3 rounded-card px-4 py-4 text-left text-lg font-semibold ring-2 elev-1 ${
              picked === o ? 'bg-leaf-soft ring-leaf' : 'bg-card ring-line hover:ring-leaf/60'
            }`}
          >
            {/* The tick is a second signal beside the tint, so the choice is not colour alone.
                `aria-checked` above is what assistive tech actually reads. */}
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${picked === o ? 'bg-leaf ring-leaf' : 'ring-line'}`}
              aria-hidden="true"
            >
              {picked === o && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-on-leaf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1 leading-snug">{S.fear.options[o]}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={() => navigate('/onboarding/summer')}>
          {S.common.back}
        </Button>
        <Button
          size="lg"
          className="flex-1"
          data-testid="fear-continue"
          disabled={!picked}
          onClick={() => {
            if (!picked) return;
            // Plan v2 section 8.5: onboarding is now three steps, and the fear check is the
            // last one, so finishing it completes onboarding and lands on Home.
            setFear(picked);
            completeOnboarding();
            navigate('/');
          }}
        >
          {S.common.continue}
        </Button>
      </div>
    </Screen>
  );
}
