import { Component, type ErrorInfo, type ReactNode } from 'react';
import { S } from '../content/strings';
import { clearPersistedState } from '../state/persistence';
import { clearThemeMirror } from '../lib/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Plan 11's malformed-state guarantee (D10). A state that was hand-edited in storage, or
 * written by a build older than the import validator, can still carry a value no screen can
 * render. Without a boundary React unmounts the whole tree and the user sees a blank page
 * with no way out, so the last resort is a visible message and a Reset demo button that
 * clears the stored state.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the detail out of the UI copy but leave it findable in the console.
    console.warn('Spare Change recovered from a render error:', error.message, info.componentStack);
  }

  private reset = async (): Promise<void> => {
    clearThemeMirror();
    await clearPersistedState();
    window.location.href = '/';
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div data-testid="app-error" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ground px-6 text-center text-ink">
        <h1 className="text-2xl font-extrabold">{S.errorBoundary.title}</h1>
        <p className="max-w-sm text-muted">{S.errorBoundary.body}</p>
        <button
          type="button"
          data-testid="app-error-reset"
          className="min-h-[44px] rounded-2xl bg-leaf px-6 py-3 font-semibold text-on-leaf"
          onClick={() => void this.reset()}
        >
          {S.errorBoundary.reset}
        </button>
      </div>
    );
  }
}
