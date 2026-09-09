import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: 'rgb(var(--c-ground) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        leaf: 'rgb(var(--c-leaf) / <alpha-value>)',
        'leaf-soft': 'rgb(var(--c-leaf-soft) / <alpha-value>)',
        coral: 'rgb(var(--c-coral) / <alpha-value>)',
        'coral-ink': 'rgb(var(--c-coral-ink) / <alpha-value>)',
        'coral-soft': 'rgb(var(--c-coral-soft) / <alpha-value>)',
        sky: 'rgb(var(--c-sky) / <alpha-value>)',
        amber: 'rgb(var(--c-amber) / <alpha-value>)',
        'amber-ink': 'rgb(var(--c-amber-ink) / <alpha-value>)',
        'amber-soft': 'rgb(var(--c-amber-soft) / <alpha-value>)',
        // C4-8: labels that sit on a filled brand colour (see src/index.css).
        'on-leaf': 'rgb(var(--c-on-leaf) / <alpha-value>)',
        'on-coral': 'rgb(var(--c-on-coral) / <alpha-value>)',
        'on-amber': 'rgb(var(--c-on-amber) / <alpha-value>)',
        'on-fill': 'rgb(var(--c-on-fill) / <alpha-value>)',
      },
      borderRadius: {
        card: '1.25rem',
      },
      maxWidth: {
        content: '720px',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
