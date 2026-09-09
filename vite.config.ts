import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Plan v2 section 1.1: the `charts` chunk rule is deleted with Recharts. The summer curves are
 * the only chart left in the product and they are inline SVG in `src/components/SummerCurves.tsx`,
 * so there is no chart library to keep out of the initial payload any more.
 *
 * What remains is the same deterministic boundary for the two heavy runtime dependencies named
 * in plan 5: `motion` and `react` are loaded up front but do not inflate the entry chunk itself.
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  const path = id.split('node_modules/').pop() ?? '';
  if (/^(framer-motion|motion-dom|motion-utils)/.test(path)) return 'motion';
  if (/^(react|react-dom|scheduler|react-router|react-router-dom)\//.test(path)) return 'react';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
  build: {
    rollupOptions: { output: { manualChunks } },
  },
});
