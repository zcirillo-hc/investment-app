import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '../state/uiStore';

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const clear = useUiStore((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(clear, 6000);
    return () => window.clearTimeout(t);
  }, [toast, clear]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          /* Centered with insets and auto margins, never a translate: framer-motion writes its
             own inline transform for `y`, which silently replaced `-translate-x-1/2` and pushed
             every toast half off a phone screen from 76c4737 until 2026-09-11. */
          className="elev-3 fixed inset-x-4 z-[60] mx-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-sm text-ground dark:bg-card dark:text-ink dark:ring-1 dark:ring-line"
          /* Plan v2 6.13: a fixed overlay at the top of a standalone launch clears the Dynamic Island. */
          style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
          role="status"
          data-testid="auto-advance-toast"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2.5">
              {/* A mark, not decoration with meaning: the words carry the message on their own. */}
              {/* The toast inverts in light mode and does not in dark, so the mark has to flip
                  with it: a pale green on the near-black panel, the brand green on the card. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-leaf-soft dark:text-leaf" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.22" />
                <path d="M7.5 12.4l3.2 3.1 6-6.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="min-w-0">{toast}</span>
            </span>
            <button type="button" onClick={clear} className="press shrink-0 rounded-full px-2 py-1 text-xs font-semibold opacity-80 underline" aria-label="Close">
              OK
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
