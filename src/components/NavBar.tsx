import { useLocation } from 'react-router-dom';
import { AppLink } from '../lib/hooks';
import { S } from '../content/strings';

interface Tab {
  to: string;
  key: keyof typeof S.nav;
  /** Stroked outline, drawn at 24 by 24. */
  icon: string;
  /** A second path filled at low opacity when the tab is active, so the icon gains weight. */
  solid?: string;
}

// Plan v2 section 1.1: Home, Places, Invest, Lessons, Settings. Activity moves to a link
// from Home, which is why it is not a tab here.
const TABS: Tab[] = [
  { to: '/', key: 'home', icon: 'M3 10.6 12 3.2l9 7.4V20a1 1 0 0 1-1 1h-5v-6.2H9V21H4a1 1 0 0 1-1-1z', solid: 'M3 10.6 12 3.2l9 7.4V20a1 1 0 0 1-1 1h-5v-6.2H9V21H4a1 1 0 0 1-1-1z' },
  { to: '/places', key: 'places', icon: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zm0-8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z', solid: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z' },
  { to: '/invest', key: 'invest', icon: 'M4 19.2h16M7.5 16V10M12 16V5.5M16.5 16v-4' },
  { to: '/lessons', key: 'lessons', icon: 'M5 5.6A2.6 2.6 0 0 1 7.6 3H19v14.2H7.6A2.6 2.6 0 0 0 5 19.8z M19 17.2v3.6H7.6', solid: 'M5 5.6A2.6 2.6 0 0 1 7.6 3H19v14.2H7.6A2.6 2.6 0 0 0 5 19.8z' },
  { to: '/settings', key: 'settings', icon: 'M4 7.5h8M16.5 7.5H20M4 16.5h3.5M12 16.5h8M14.2 7.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM9.8 16.5a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 0 0-4.4 0z' },
];

/**
 * Bottom tab bar under 1024 px, left rail at 1024 px and above.
 *
 * Visual polish pass, 2026-09-09: the active tab now carries a tinted pill behind its icon
 * and a filled version of the glyph, so which tab you are on survives a glance and does not
 * rely on colour alone. The bar's box is untouched: same height, same insets, same 44 point
 * targets, because criterion 20a measures all three.
 */
export function NavBar() {
  const { pathname } = useLocation();
  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  return (
    <nav
      aria-label="Main"
      data-testid="nav"
      className="fixed inset-x-0 bottom-0 z-40 h-16 border-t border-line bg-card/95 backdrop-blur-xl lg:inset-y-0 lg:left-0 lg:right-auto lg:h-auto lg:w-56 lg:border-r lg:border-t-0 lg:px-3 lg:pt-20"
      /*
       * Plan v2 6.13. The five tabs must clear the home indicator rather than sitting under it
       * or being intercepted by the system swipe gesture there. The bar grows by the inset
       * instead of squeezing the tabs inside a fixed 64 px, which would take them below the
       * 44 pt minimum on a phone with a large inset. `box-sizing: content-box` on the height is
       * what makes h-16 the height of the tab row rather than of the row plus the inset.
       */
      style={{
        paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        boxSizing: 'content-box',
      }}
    >
      <ul className="flex h-full items-stretch justify-around lg:flex-col lg:justify-start lg:gap-1">
        {TABS.map((t) => {
          const on = active(t.to);
          return (
            <li key={t.key} className="flex-1 lg:flex-none">
              <AppLink
                to={t.to}
                data-testid={`nav-${t.key}`}
                aria-current={on ? 'page' : undefined}
                className={`press flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold lg:flex-row lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-2 lg:py-2 lg:text-base ${
                  on ? 'text-leaf lg:bg-leaf-soft' : 'text-muted hover:text-ink'
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 lg:h-9 lg:w-9 ${
                    on ? 'bg-leaf-soft lg:bg-transparent' : 'bg-transparent'
                  }`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {on && t.solid && <path d={t.solid} fill="currentColor" opacity="0.16" stroke="none" />}
                    <path d={t.icon} />
                  </svg>
                </span>
                <span>{S.nav[t.key]}</span>
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
