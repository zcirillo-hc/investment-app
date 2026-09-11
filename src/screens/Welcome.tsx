import { useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import { useAppNavigate } from '../lib/hooks';
import { S } from '../content/strings';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Logo } from '../components/Logo';
import { parseImport, writeImportedState } from '../state/persistence';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Welcome() {
  const existingName = useAppStore((s) => s.profile.name);
  const existingEmail = useAppStore((s) => s.profile.email);
  const setProfile = useAppStore((s) => s.setProfile);
  const navigate = useAppNavigate();
  const [name, setName] = useState(existingName);
  const [email, setEmail] = useState(existingEmail);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    const r = parseImport(await file.text());
    if (!r.ok) {
      setImportError(r.looksLikeExport ? S.welcome.importInvalid(r.section) : S.welcome.importBad);
      return;
    }
    await writeImportedState(r.state, r.tidied);
    window.location.reload();
  };

  /** Our own validation, so the copy in 6.1 is what the user sees (D8). */
  const problem = (n: string, e: string): string | null => {
    if (n.length < 1) return S.welcome.nameRequired;
    if (n.length > 40) return S.welcome.nameTooLong;
    if (e.length > 0 && !EMAIL_RE.test(e)) return S.welcome.emailInvalid;
    return null;
  };

  // Once a message is showing, keep it honest: re-check on every keystroke so a fixed
  // field never leaves a stale message about it on screen.
  const revalidate = (n: string, e: string) => {
    if (error !== null) setError(problem(n.trim(), e.trim()));
  };

  const submit = () => {
    const n = name.trim();
    const e = email.trim();
    const p = problem(n, e);
    setError(p);
    if (p !== null) return;
    setProfile(n, e);
    navigate('/onboarding/summer');
  };

  return (
    <Screen id="welcome" className="pt-10">
      <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-card px-3.5 py-2 font-bold ring-1 ring-line/70 elev-1">
        <Logo size={26} />
        <span>{S.appName}</span>
      </div>
      <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-tight sm:text-5xl">{S.welcome.headline}</h1>
      <p className="mt-4 max-w-[46ch] text-lg leading-snug text-muted">{S.welcome.explanation}</p>
      {/*
        Visual polish pass, 2026-09-09: the three steps are numbered. They were already in
        order and already three colours, but nothing said they were a sequence rather than
        three unrelated claims, which is the one thing this screen has to land.
      */}
      <ul className="stagger mt-7 grid gap-3 sm:grid-cols-3">
        {S.welcome.how.map((h, i) => (
          <li key={i}>
            <Card tone={i === 0 ? 'leaf' : i === 1 ? 'coral' : 'amber'} className="h-full">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold num ${
                    i === 0 ? 'bg-leaf text-on-leaf' : i === 1 ? 'bg-coral text-on-coral' : 'bg-amber text-on-amber'
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="text-lg font-extrabold">{h.title}</div>
              </div>
              <div className="mt-1.5 text-sm leading-snug">{h.body}</div>
            </Card>
          </li>
        ))}
      </ul>
      <form
        className="mt-8 space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className="text-sm font-semibold">{S.welcome.nameLabel}</span>
          <input
            data-testid="welcome-name"
            className="mt-1 w-full rounded-2xl bg-card px-4 py-3 text-lg ring-1 ring-line transition elev-1 focus:outline-none focus:ring-2 focus:ring-leaf"
            value={name}
            maxLength={60}
            autoComplete="given-name"
            placeholder={S.welcome.namePlaceholder}
            onChange={(e) => {
              setName(e.target.value);
              revalidate(e.target.value, email);
            }}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{S.welcome.emailLabel}</span>
          <input
            data-testid="welcome-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="mt-1 w-full rounded-2xl bg-card px-4 py-3 text-lg ring-1 ring-line transition elev-1 focus:outline-none focus:ring-2 focus:ring-leaf"
            value={email}
            placeholder={S.welcome.emailPlaceholder}
            onChange={(e) => {
              setEmail(e.target.value);
              revalidate(name, e.target.value);
            }}
          />
        </label>
        {error && (
          <p role="alert" data-testid="welcome-error" className="text-sm font-semibold text-coral-ink">
            {error}
          </p>
        )}
        <p className="rounded-2xl bg-card/70 p-3 text-sm leading-snug text-muted ring-1 ring-line/60">{S.welcome.noPassword}</p>
        <Button type="submit" size="lg" full data-testid="welcome-continue">
          {S.common.continue}
        </Button>
        <p className="text-center text-xs text-muted">{S.welcome.demoNote}</p>
      </form>
      <div className="mt-6 text-center">
        {/* D12: 44 px tall at 375, per the revised plan 11 ("including but not limited to"). */}
        <button
          type="button"
          className="press inline-flex min-h-[44px] items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-leaf underline"
          onClick={() => fileInput.current?.click()}
        >
          {S.welcome.importLink}
        </button>
        {/*
          * The visible button above is the control; this input is only its file picker. It
          * used to carry the same aria-label, which put two same-named buttons in the
          * accessibility tree (and made "the import control" ambiguous to measure). Out of
          * the tab order and out of the tree, so the button is the single named control.
          */}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          data-testid="welcome-import"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onImportFile(e.target.files?.[0])}
        />
        {importError && (
          <p role="alert" data-testid="welcome-import-error" className="mt-2 text-sm font-semibold text-coral-ink">
            {importError}
          </p>
        )}
      </div>
    </Screen>
  );
}
