import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import { S } from '../content/strings';
import { getUrlParams } from '../state/urlParams';
import { Card } from './Card';
import { Button } from './Button';
import { RichText } from './Term';
import { subscribe, supportState, unsubscribeEverywhere, timeZoneIsFallback } from '../lib/push';
import type { PushSupportState } from '../domain/types';

/**
 * Plan v2 section 8.10, with the copy from 9.4a to 9.4d and 9.5. One card, and the only place
 * in the app where the server is visible.
 *
 * Three things here are requirements rather than choices.
 *
 * 1. **The operating system prompt is never the first thing the user sees.** In the supported
 *    state the toggle opens the 9.4a panel, and only its explicit "Turn nudges on" reaches
 *    `Notification.requestPermission`. Nothing else in the app calls it.
 *
 * 2. **No permission request is ever attempted in the iPhone Safari or the denied state**
 *    (6.2, criteria 20 and 24). In a plain Safari tab it would refuse, or worse, consume the
 *    user's one willing tap on a prompt that cannot lead anywhere; once denied, only the user
 *    can change it, and we said we would stop asking.
 *
 * 3. **The in app loop is never gated on any of this.** `settings.nudgesEnabled` is the single
 *    source of truth for whether nudges exist at all (R4.5), and the toggle sets it in every
 *    state, including denied and unsupported. That is what criterion 24 asks for: permission
 *    denied, and habits still form, the card still appears on Home, and a skip still credits
 *    the jar. The push subscription only decides whether a notification also arrives.
 */
type Panel = 'none' | 'explainer' | 'install' | 'denied';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function NudgesCard() {
  const state = useAppStore();
  const setNudgesEnabled = useAppStore((s) => s.setNudgesEnabled);
  const mutePlace = useAppStore((s) => s.mutePlace);
  const setPushSupport = useAppStore((s) => s.setPushSupport);
  const setPushSubscribed = useAppStore((s) => s.setPushSubscribed);
  const setPushError = useAppStore((s) => s.setPushError);
  const clearPush = useAppStore((s) => s.clearPush);
  const markServerPrivacySeen = useAppStore((s) => s.markServerPrivacySeen);
  const markInstallExplainerSeen = useAppStore((s) => s.markInstallExplainerSeen);

  const forced = getUrlParams().push;
  const [support, setSupport] = useState<PushSupportState>(forced ?? 'unknown');
  const [panel, setPanel] = useState<Panel>('none');
  const [busy, setBusy] = useState(false);
  const [turnOffMsg, setTurnOffMsg] = useState<string | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const on = state.settings.nudgesEnabled;

  /**
   * Test report V2-1. `on` says whether the in app nudge exists (R4.5). It says NOTHING about
   * whether a row exists on the server, because `onToggle` deliberately turns nudges on
   * without subscribing in `denied`, `needs-ios-install` and `unsupported` (criterion 24's in
   * app loop must keep working there). Every sentence about the server is therefore gated on
   * this instead, which is only ever set by a subscribe that actually succeeded.
   */
  const hasServerRow = state.push.subscribed;

  useEffect(() => {
    const s = forced ?? supportState();
    setSupport(s);
    setPushSupport(s);
  }, [forced, setPushSupport]);

  // 6.2 state 3: where beforeinstallprompt fires, offer an optional install, worded so that
  // nobody installs under the impression that they must (9.4d).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const openPanelFor = (s: PushSupportState): Panel => {
    if (s === 'needs-ios-install') return 'install';
    if (s === 'denied') return 'denied';
    if (s === 'ready') return 'explainer';
    return 'none';
  };

  const onToggle = (next: boolean) => {
    setTurnOffMsg(null);
    if (!next) {
      void turnOff();
      return;
    }
    const p = openPanelFor(support);
    setPanel(p);
    if (p === 'install') markInstallExplainerSeen();
    // 'ready' waits for the panel's own confirm, so that the permission prompt is never the
    // first thing the user sees. Every other state turns the in app nudge on right away,
    // because nothing about it depends on a notification arriving.
    if (support !== 'ready') setNudgesEnabled(true);
  };

  /** 9.4a's confirm. The only path in the app that reaches `Notification.requestPermission`. */
  const confirmTurnOn = async () => {
    markServerPrivacySeen();
    setPanel('none');
    setBusy(true);
    // On first, so a failure below leaves an app that nudges rather than one that does not.
    setNudgesEnabled(true);
    const r = await subscribe();
    setBusy(false);
    if (r.ok) {
      setPushSubscribed(r.endpointHash, r.tz);
      return;
    }
    // Nothing here claims a nudge was scheduled. The card says which part failed (6.12).
    setPushError(r.kind === 'unsupported' ? 'server' : r.kind);
    if (r.kind === 'permission') {
      const s = supportState();
      setSupport(s);
      setPushSupport(s);
    }
  };

  /** 9.5. Turning nudges off always succeeds locally, and says honestly what the server did. */
  const turnOff = async () => {
    setBusy(true);
    // Read before `clearPush()` wipes it: "the row is gone" is only true if there was one.
    const hadServerRow = hasServerRow;
    setNudgesEnabled(false);
    setPanel('none');
    const r = await unsubscribeEverywhere();
    clearPush();
    setBusy(false);
    if (!hadServerRow) {
      setTurnOffMsg(S.nudges.turnOffDoneLocal);
      return;
    }
    setTurnOffMsg(r.serverOk ? S.nudges.turnOffDone : S.nudges.turnOffOffline);
  };

  const nameOf = (placeId: string) => state.places.find((p) => p.id === placeId)?.displayName ?? placeId;

  return (
    <Card className="mt-4" data-testid="nudges-card">
      <h2 className="text-base font-extrabold">{S.nudges.title}</h2>

      {support === 'unsupported' ? (
        <p className="mt-2 text-sm" data-testid="nudges-state">
          {S.nudges.unsupported}
        </p>
      ) : (
        <label className="mt-2 flex items-center justify-between gap-4">
          <span className="text-sm font-bold">{S.nudges.toggle}</span>
          <input
            type="checkbox"
            role="switch"
            data-testid="nudges-toggle"
            disabled={busy}
            className="switch-track h-11 w-11 cursor-pointer appearance-none rounded-full bg-clip-content py-[10px] transition before:block before:h-5 before:w-5 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:transition checked:before:translate-x-[22px]"
            checked={on}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </label>
      )}

      <p className="mt-1 text-xs text-muted">{S.nudges.what}</p>

      <p
        className="mt-2 text-sm font-semibold"
        data-testid="nudges-state"
        data-support={support}
        data-on={on ? 'true' : 'false'}
        data-subscribed={hasServerRow ? 'true' : 'false'}
      >
        {!on ? S.nudges.off : hasServerRow ? S.nudges.on : S.nudges.onAppOnly}
      </p>

      {support === 'ready' && !on && (
        <button
          type="button"
          data-testid="nudges-explainer-link"
          className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-leaf underline"
          onClick={() => setPanel('explainer')}
        >
          {S.nudges.explainerLink}
        </button>
      )}

      {/* A10: quiet hours are fixed at 06:00 to 21:00 this cycle, so this states them and the
          UI does not appear to offer editing. */}
      <p className="mt-2 text-sm" data-testid="nudges-quiet-hours">
        <RichText text={S.nudges.quietHours(state.settings.quietStartMinute, state.settings.quietEndMinute)} />{' '}
        <span className="text-muted">{S.nudges.quietHoursFixed}</span>
      </p>

      {on && (
        <>
          {/* V2-1: the server block only exists where a server row does. */}
          <div className="mt-3 rounded-2xl bg-ground p-3.5 ring-1 ring-line/70" data-testid={hasServerRow ? 'nudges-stored' : 'nudges-not-stored'}>
            <h3 className="text-sm font-semibold">{hasServerRow ? S.nudges.storedTitle : S.nudges.notStoredTitle}</h3>
            <p className="mt-1 text-xs text-muted">{hasServerRow ? S.nudges.storedLine : S.nudges.notStoredLine}</p>
            {hasServerRow && state.push.endpointHash && (
              <p className="mt-1 text-xs text-muted" data-testid="nudges-endpoint">
                {S.nudges.endpointLabel(state.push.endpointHash.slice(0, 8))}
              </p>
            )}
            <button
              type="button"
              data-testid="nudges-explainer-link-on"
              className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-leaf underline"
              onClick={() => setPanel('explainer')}
            >
              {S.nudges.explainerLink}
            </button>
          </div>

          {timeZoneIsFallback() && (
            <p className="mt-2 text-sm font-semibold text-amber-ink" data-testid="nudges-tz-fallback">
              {S.nudges.tzFallback}
            </p>
          )}

          {state.push.lastError !== null && (
            <div className="mt-2" data-testid="nudges-error">
              <p className="text-sm font-semibold text-amber-ink">
                {state.push.lastError === 'permission' ? S.nudges.scheduleFailed : S.nudges.unreachable}
              </p>
              <Button size="sm" variant="secondary" data-testid="nudges-retry" disabled={busy} onClick={() => void confirmTurnOn()}>
                {S.nudges.retry}
              </Button>
            </div>
          )}

          <h3 className="mt-3 text-sm font-semibold">{S.settings.mutedTitle}</h3>
          {state.settings.mutedPlaceIds.length === 0 ? (
            <p className="mt-1 text-xs text-muted" data-testid="settings-muted-none">
              {S.settings.mutedNone}
            </p>
          ) : (
            <ul className="mt-1 space-y-2" data-testid="settings-muted-list">
              {state.settings.mutedPlaceIds.map((id) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{nameOf(id)}</span>
                  <Button size="sm" variant="secondary" data-testid={`settings-unmute-${id}`} onClick={() => mutePlace(id, false)}>
                    {S.settings.unmute}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <Button size="sm" variant="secondary" data-testid="nudges-turn-off" disabled={busy} onClick={() => void turnOff()}>
              {S.nudges.turnOff}
            </Button>
            <p className="mt-1 text-xs text-muted">{hasServerRow ? S.nudges.turnOffConfirm : S.nudges.turnOffConfirmLocal}</p>
          </div>
        </>
      )}

      {turnOffMsg && (
        <p className="mt-2 text-sm font-semibold" role="status" data-testid="nudges-turn-off-message">
          {turnOffMsg}
        </p>
      )}

      {/* 9.4a. Shown in full, with an explicit continue, before any permission prompt. */}
      {panel === 'explainer' && (
        <div className="mt-3 rounded-2xl bg-ground p-3.5 ring-1 ring-line/70" data-testid="nudges-explainer">
          <h3 className="font-bold">{S.nudges.explainerTitle}</h3>
          <p className="mt-2 text-sm">{S.nudges.explainerBody}</p>
          <p className="mt-2 text-sm">{S.nudges.explainerBody2}</p>
          <p className="mt-2 text-sm">{S.nudges.explainerBody3}</p>
          <p className="mt-2 text-sm">{S.nudges.explainerBody4}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" data-testid="nudges-explainer-yes" disabled={busy} onClick={() => void confirmTurnOn()}>
              {S.nudges.explainerYes}
            </Button>
            <Button size="sm" variant="secondary" data-testid="nudges-explainer-no" onClick={() => setPanel('none')}>
              {S.nudges.explainerNo}
            </Button>
          </div>
        </div>
      )}

      {/* 9.4b. iPhone and iPad Safari before Add to Home Screen. No permission request. */}
      {panel === 'install' && (
        <div className="mt-3 rounded-2xl bg-ground p-3.5 ring-1 ring-line/70" data-testid="install-panel">
          <h3 className="font-bold">{S.nudges.installTitle}</h3>
          <p className="mt-2 text-sm">{S.nudges.installBody}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm" data-testid="install-steps">
            <li>{S.nudges.installStep1}</li>
            <li>{S.nudges.installStep2}</li>
            <li>{S.nudges.installStep3}</li>
          </ol>
          <p className="mt-2 text-xs text-muted">{S.nudges.installFooter}</p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" data-testid="install-panel-dismiss" onClick={() => setPanel('none')}>
              {S.common.notNow}
            </Button>
          </div>
        </div>
      )}

      {/* 9.4c. Denied. `requestPermission` is not called again on any render or reload. */}
      {panel === 'denied' && (
        <div className="mt-3 rounded-2xl bg-ground p-3.5 ring-1 ring-line/70" data-testid="denied-panel">
          <h3 className="font-bold">{S.nudges.deniedTitle}</h3>
          <p className="mt-2 text-sm">{S.nudges.deniedBody}</p>
          <p className="mt-2 text-sm">{S.nudges.deniedBody2}</p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" data-testid="denied-panel-dismiss" onClick={() => setPanel('none')}>
              {S.common.notNow}
            </Button>
          </div>
        </div>
      )}

      {/* 9.4d. Optional, and only where the browser offered it. */}
      {installEvent && (
        <div className="mt-3" data-testid="install-app">
          <Button size="sm" variant="secondary" onClick={() => void installEvent.prompt()}>
            {S.nudges.installAppBtn}
          </Button>
          <p className="mt-1 text-xs text-muted">{S.nudges.installAppNote}</p>
        </div>
      )}
    </Card>
  );
}
