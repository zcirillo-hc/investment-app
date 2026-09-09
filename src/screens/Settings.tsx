import { useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import { S } from '../content/strings';
import { Screen, ScreenTitle } from '../components/Screen';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { RichText } from '../components/Term';
import { NudgesCard } from '../components/NudgesCard';
import { useAppNavigate } from '../lib/hooks';
import { clearMirror, clearPersistedState, exportStateJson, isStorageFallback, parseImport, pickAppState, writeImportedState } from '../state/persistence';
import { clearPendingNudge } from '../lib/pendingNudge';
import { unsubscribeEverywhere } from '../lib/push';
import { V1_REFUSAL } from '../state/validate';
import { APP_VERSION, JAR_GOAL_PRESETS, MAX_CATCH_PCT, MIN_CATCH_PCT } from '../config';
import { todayLocal } from '../domain/dates';
import type { Theme } from '../domain/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Settings() {
  const state = useAppStore();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const deleteAllPlaces = useAppStore((s) => s.deleteAllPlaces);
  const setTheme = useAppStore((s) => s.setTheme);
  const setProfile = useAppStore((s) => s.setProfile);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const navigate = useAppNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteAllMsg, setDeleteAllMsg] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [name, setName] = useState(state.profile.name);
  const [email, setEmail] = useState(state.profile.email);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const saveProfile = () => {
    const n = name.trim();
    const e = email.trim();
    if (n.length < 1 || n.length > 40) return setProfileMsg(S.settings.nameInvalid);
    if (e.length > 0 && !EMAIL_RE.test(e)) return setProfileMsg(S.settings.emailInvalid);
    setProfileMsg(null);
    setProfile(n, e);
  };

  /**
   * Plan 6.9 and criterion 25. The only action in the app that can fail halfway, so it reports
   * what it did rather than claiming success: unsubscribe and delete the server row first,
   * wait for the answer, then clear this browser, then say which parts worked.
   */
  const onDeleteEverything = async () => {
    const hadSubscription = state.push.subscribed || state.settings.nudgesEnabled;
    const r = await unsubscribeEverywhere();
    let local = true;
    try {
      await clearPendingNudge();
      await clearPersistedState();
      clearMirror();
    } catch {
      local = false;
    }
    setDeleteAllMsg(S.settings.deleteEverythingDone(hadSubscription ? (r.serverOk ? 'deleted' : 'not-reached') : 'none', local));
    await resetDemo();
    navigate('/welcome');
  };

  const onExport = () => {
    const json = exportStateJson(pickAppState(state));
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spare-change-export-${todayLocal()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const r = parseImport(text);
    if (!r.ok) {
      // Plan 1.4 and A7: a v1 file is refused with its own named message, not migrated.
      setImportMsg(r.problems.includes(V1_REFUSAL) ? S.settings.importV1 : S.settings.importBad);
      return;
    }
    setImportMsg(S.settings.importOk);
    await writeImportedState(r.state);
    window.location.reload();
  };

  const segment = (active: boolean) => `press min-h-[44px] flex-1 rounded-full px-3 text-sm font-semibold ${active ? 'bg-leaf text-on-leaf elev-1' : 'bg-card ring-1 ring-line'}`;

  return (
    <Screen id="settings">
      <ScreenTitle title={S.settings.title} />

      <Card className="mt-4">
        <h2 className="text-base font-extrabold">{S.settings.profileTitle}</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold">{S.settings.name}</span>
            <input data-testid="settings-name" className="mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 ring-1 ring-line transition focus:outline-none focus:ring-2 focus:ring-leaf" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={saveProfile} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">{S.settings.email}</span>
            <input data-testid="settings-email" type="email" className="mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 ring-1 ring-line transition focus:outline-none focus:ring-2 focus:ring-leaf" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={saveProfile} />
          </label>
        </div>
        {profileMsg && (
          <p role="alert" data-testid="settings-profile-error" className="mt-2 text-sm font-semibold text-coral-ink">
            {profileMsg}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">{S.settings.profileNote}</p>
      </Card>

      {/* Plan 8.4: the jar goal replaces the sweep threshold. R6.3: nothing moves when it is reached. */}
      <Card className="mt-4">
        <h2 className="text-base font-extrabold">{S.settings.jarGoalTitle}</h2>
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label={S.settings.jarGoalTitle}>
          {JAR_GOAL_PRESETS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={state.settings.jarGoalCents === c} data-testid={`settings-jar-goal-${c}`} className={segment(state.settings.jarGoalCents === c)} onClick={() => updateSettings({ jarGoalCents: c })}>
              {S.settings.jarGoalOption(c)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{S.settings.jarGoalNote}</p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-extrabold">
          <RichText text={S.settings.catchTitle} />
        </h2>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" aria-label={S.settings.catchMinus} data-testid="settings-catch-pct-minus" className="press h-11 w-11 rounded-full bg-leaf-soft text-xl font-bold ring-1 ring-line/60" onClick={() => updateSettings({ catchPct: Math.max(MIN_CATCH_PCT, state.settings.catchPct - 1) })}>
            -
          </button>
          <span data-testid="settings-catch-pct" data-pct={state.settings.catchPct} className="w-16 text-center font-mono text-xl font-bold">
            {S.settings.catchPct(state.settings.catchPct)}
          </span>
          <button type="button" aria-label={S.settings.catchPlus} data-testid="settings-catch-pct-plus" className="press h-11 w-11 rounded-full bg-leaf-soft text-xl font-bold ring-1 ring-line/60" onClick={() => updateSettings({ catchPct: Math.min(MAX_CATCH_PCT, state.settings.catchPct + 1) })}>
            +
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">{S.settings.catchNote}</p>
      </Card>

      {/* Plan 8.4 and 8.10: the Nudges card, with the install and permission panels. */}
      <NudgesCard />

      <Card className="mt-4">
        <h2 className="text-base font-extrabold">{S.settings.themeTitle}</h2>
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label={S.settings.themeTitle}>
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={state.settings.theme === t} data-testid={`settings-theme-${t}`} className={segment(state.settings.theme === t)} onClick={() => setTheme(t)}>
              {S.settings.theme[t]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{S.settings.themeNote}</p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-extrabold">{S.settings.dataTitle}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" data-testid="settings-export" onClick={onExport}>
            {S.settings.exportBtn}
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            {S.settings.importBtn}
          </Button>
          {/*
            * Test report V2-8, the shape the D12 fix removed from Welcome and did not carry
            * across. The visible button above is the control; this input is only its file
            * picker. With an `aria-label` and no `tabIndex` it was a second focusable element
            * with the same accessible name, 1x1, which a keyboard or screen reader user meets
            * as "Import JSON" twice. Out of the tab order and out of the accessibility tree,
            * exactly as `Welcome.tsx` does it.
            */}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            data-testid="settings-import"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void onImportFile(e.target.files?.[0])}
          />
          {/* R11.4. */}
          <Button variant="secondary" data-testid="settings-delete-places" onClick={() => deleteAllPlaces()}>
            {S.settings.deletePlaces}
          </Button>
        </div>
        {importMsg && (
          <p className="mt-2 text-sm font-semibold" data-testid="settings-import-message" role="status">
            {importMsg}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">{S.settings.dataNote}</p>
        {isStorageFallback() && <p className="mt-2 text-xs font-semibold text-amber-ink" data-testid="settings-storage-fallback">{S.settings.storageFallback}</p>}
      </Card>

      {/* Plan 1.3: the one honest line that replaces the fee card. R15.6: and the standing
          education line, once, here. The same sentence is on Lessons and on Learn. */}
      <Card className="mt-4">
        <p className="text-sm" data-testid="settings-no-charge">
          {S.settings.noCharge}
        </p>
        <p className="mt-2 text-sm" data-testid="settings-not-advice">
          {S.settings.notAdvice}
        </p>
      </Card>

      {/* Plan 6.9 and 9.5. */}
      <Card className="mt-4" tone="coral">
        {!confirmDeleteAll ? (
          <Button variant="danger" data-testid="delete-everything" onClick={() => setConfirmDeleteAll(true)}>
            {S.settings.deleteEverything}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" data-testid="delete-everything-confirm" onClick={() => void onDeleteEverything()}>
              {S.settings.deleteEverythingYes}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDeleteAll(false)}>
              {S.common.cancel}
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs">{S.settings.deleteEverythingConfirm}</p>
        {deleteAllMsg && (
          <p className="mt-2 text-sm font-semibold" role="status" data-testid="delete-everything-message">
            {deleteAllMsg}
          </p>
        )}
      </Card>

      <Card className="mt-4" tone="coral">
        {!confirmReset ? (
          <Button variant="danger" data-testid="settings-reset" onClick={() => setConfirmReset(true)}>
            {S.settings.reset}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              data-testid="settings-reset-confirm"
              onClick={async () => {
                await resetDemo();
                navigate('/welcome');
              }}
            >
              {S.settings.resetConfirm}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              {S.common.cancel}
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs">{S.settings.resetNote}</p>
      </Card>
      <p className="mt-6 text-center text-xs text-muted" data-testid="settings-version">
        {S.settings.version(APP_VERSION)}
      </p>
    </Screen>
  );
}
