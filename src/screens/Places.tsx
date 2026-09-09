import { useState } from 'react';
import { useAppStore } from '../state/store';
import { S } from '../content/strings';
import { Screen, ScreenTitle } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { RichText } from '../components/Term';
import { EmptyState } from '../components/EmptyState';
import { placeRows } from '../domain/selectors';

/**
 * Plan v2 section 8.6 and 9.4. The privacy and control surface, and the screen that makes the
 * inference explainable. A place that is visited often but at irregular times says so in
 * words (R3.4), so the user can see why it is not nudging them.
 *
 * Visual polish pass, 2026-09-09. A place is a thing you go to, so each row now leads with a
 * mark rather than with a heading, its two facts sit in chips, and the status sentence gets a
 * tinted panel keyed to the three states. The status is never carried by colour alone: the
 * sentence is the same one R3.4 requires, in full, in every state.
 */

const STATUS_SKIN: Record<string, string> = {
  habit: 'bg-leaf-soft',
  irregular: 'bg-amber-soft',
  notEnough: 'bg-ground',
};

export function Places() {
  const state = useAppStore();
  const mutePlace = useAppStore((s) => s.mutePlace);
  const deletePlace = useAppStore((s) => s.deletePlace);
  const deleteAllPlaces = useAppStore((s) => s.deleteAllPlaces);
  const setNudgesEnabled = useAppStore((s) => s.setNudgesEnabled);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const rows = placeRows(state);

  return (
    <Screen id="places">
      <ScreenTitle title={S.places.title} sub={S.places.sub} />

      <Card className="mt-4" data-testid="places-privacy">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-leaf-soft" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-leaf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s7-3.6 7-9V6.2L12 3.4 5 6.2V12c0 5.4 7 9 7 9z" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="font-bold">{S.places.privacyTitle}</h2>
            <p className="mt-1 text-sm leading-snug text-muted">{S.places.privacyBody}</p>
            <p className="mt-2 text-sm" data-testid="places-location-state">
              <RichText text={S.places.locationOff} />
            </p>
          </div>
        </div>
      </Card>

      {!state.settings.nudgesEnabled && (
        <Card className="mt-4" tone="amber" data-testid="places-nudges-off">
          <p className="text-sm">{S.places.nudgesOffNote}</p>
          <Button size="sm" className="mt-2.5" data-testid="places-enable-nudges" onClick={() => setNudgesEnabled(true)}>
            {S.places.turnOnNudges}
          </Button>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState className="mt-4" spot="places" testId="places-empty" title={S.places.emptyTitle} body={S.places.empty} />
      ) : (
        <ul className="stagger mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.place.id}>
              <Card data-testid="place-row" data-place-id={r.place.id} data-habit={r.status === 'habit' ? 'true' : 'false'}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold ${r.muted ? 'bg-ground text-muted' : 'bg-leaf-soft text-leaf'}`} aria-hidden="true">
                    {r.place.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <h2 className="text-lg font-extrabold leading-tight" data-testid="place-name">
                        {r.place.displayName}
                      </h2>
                      {r.place.coarseLabel && <span className="text-xs text-muted">{r.place.coarseLabel}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold text-muted">
                      <span className="rounded-full bg-ground px-2.5 py-1" data-testid="place-visits">
                        {S.places.visits(r.visitsInWindow)}
                      </span>
                      <span className="rounded-full bg-ground px-2.5 py-1" data-testid="place-usual-time">
                        {/* The usual time is a term the app invented, so it carries its tooltip. */}
                        <RichText text={r.usualMinute === null ? S.places.noUsualTime : S.places.usualTime(r.usualMinute)} />
                      </span>
                    </div>
                  </div>
                </div>

                <p
                  className={`mt-3 rounded-2xl p-2.5 text-sm ${STATUS_SKIN[r.status] ?? 'bg-ground'}`}
                  data-testid="place-status"
                  data-status={r.status}
                >
                  <RichText
                    text={r.status === 'habit' ? S.places.statusHabit : r.status === 'irregular' ? S.places.statusIrregular : S.places.statusNotEnough}
                  />
                </p>

                {r.status === 'habit' && r.estimateCents !== null && (
                  <p className="mt-2 text-sm font-bold" data-testid="place-estimate" data-cents={r.estimateCents}>
                    {S.places.estimate(r.estimateCents)}{' '}
                    <span className="text-xs font-normal text-muted">
                      <RichText text={S.places.estimateLabel} />
                    </span>
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                  <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      role="switch"
                      data-testid={`place-mute-${r.place.id}`}
                      aria-label={S.places.muteLabel(r.place.displayName)}
                      className="switch-track h-11 w-11 cursor-pointer appearance-none rounded-full bg-clip-content py-[10px] transition before:block before:h-5 before:w-5 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:transition checked:before:translate-x-[22px]"
                      checked={r.muted}
                      onChange={(e) => mutePlace(r.place.id, e.target.checked)}
                    />
                    <span>{r.muted ? S.places.muted : S.places.mute}</span>
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-auto"
                    data-testid={`place-delete-${r.place.id}`}
                    aria-label={S.places.deleteLabel(r.place.displayName)}
                    onClick={() => setConfirmId(r.place.id)}
                  >
                    {S.places.deleteOne}
                  </Button>
                </div>
                {confirmId === r.place.id && (
                  <div className="mt-3 rounded-2xl bg-coral-soft p-3" data-testid="place-delete-confirm">
                    <p className="text-sm">{S.places.deleteConfirm(r.place.displayName)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        data-testid="place-delete-yes"
                        onClick={() => {
                          deletePlace(r.place.id);
                          setConfirmId(null);
                        }}
                      >
                        {S.places.deleteYes}
                      </Button>
                      <Button size="sm" variant="secondary" data-testid="place-delete-cancel" onClick={() => setConfirmId(null)}>
                        {S.common.cancel}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-4" tone="coral">
        {!confirmAll ? (
          <Button variant="danger" data-testid="places-delete-all" onClick={() => setConfirmAll(true)}>
            {S.places.deleteAll}
          </Button>
        ) : (
          <div>
            <p className="text-sm">{S.places.deleteAllConfirm}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="danger"
                data-testid="places-delete-all-yes"
                onClick={() => {
                  deleteAllPlaces();
                  setConfirmAll(false);
                }}
              >
                {S.places.deleteAllYes}
              </Button>
              <Button variant="secondary" data-testid="places-delete-all-cancel" onClick={() => setConfirmAll(false)}>
                {S.common.cancel}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Screen>
  );
}
