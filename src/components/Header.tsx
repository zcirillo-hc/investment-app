import { useLongPress } from '../lib/hooks';
import { useUiStore } from '../state/uiStore';
import { S } from '../content/strings';
import { AppLink } from '../lib/hooks';
import { Logo } from './Logo';

export interface BackControl {
  /** Where the control goes. Always a route inside the app, never browser history. */
  to: string;
  /** Read out by assistive tech, and used as the visible label at desktop widths. */
  label: string;
}

/**
 * Plan v2 6.13.
 *
 * Two things happen here that only matter on a real iPhone.
 *
 * 1. Safe area. A Home Screen launch draws edge to edge with no Safari chrome, so this sticky
 *    header sits under the Dynamic Island unless it pads itself. Padding rather than margin,
 *    so the safe content area keeps the header's own background behind the status bar.
 *
 * 2. The back control. A standalone launch has no browser back button, so every screen a user
 *    can only reach by drilling in from a tab has to supply its own way back. `AppShell`
 *    decides which route needs one; this renders it, to the left of the title, at Apple's own
 *    44 by 44 point minimum.
 */
export function Header({ title, back }: { title?: string; back?: BackControl }) {
  const setTrayOpen = useUiStore((s) => s.setTrayOpen);
  const press = useLongPress(() => setTrayOpen(true));
  return (
    <header
      className="sticky top-0 z-30 border-b border-line/60 bg-ground/85 backdrop-blur-xl lg:fixed lg:left-0 lg:top-0 lg:z-50 lg:w-56 lg:border-b-0 lg:bg-transparent lg:backdrop-blur-0"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex h-14 max-w-content items-center justify-between gap-2 px-4 lg:h-20 lg:px-5">
        <div className="flex min-w-0 items-center gap-1">
          {back && (
            <AppLink
              to={back.to}
              data-testid="header-back"
              aria-label={back.label}
              className="press -ml-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-leaf hover:bg-leaf-soft"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card ring-1 ring-line/70 elev-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </span>
            </AppLink>
          )}
          <button
            type="button"
            data-testid="logo"
            className="long-press-target flex min-h-[44px] select-none items-center gap-2 rounded-xl px-1 py-1 text-left font-bold tracking-tight"
            aria-label={S.appName}
            {...press}
          >
            <Logo />
            <span className="truncate">{S.appName}</span>
          </button>
        </div>
        {title && <span className="shrink-0 text-sm text-muted lg:hidden">{title}</span>}
      </div>
    </header>
  );
}
