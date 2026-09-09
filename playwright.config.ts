import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  /**
   * Raised from 120 s. Two specs (`tooltip.spec.ts`'s 116-tap sweep and
   * `tester-cycle4.spec.ts`'s deliberately throttled cold load) are minutes of real work by
   * design, and both hit the old budget under machine load while passing in isolation. This is
   * headroom for the machine, not for the tests: nothing here waits on a fixed sleep for its
   * result, so a genuinely hung test still fails, just later.
   */
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  /**
   * Still one worker. Measured on this box (8 cores, 8 GB): a full run already drives it into
   * memory pressure - two of the three run-1 failures and all three non-D19 run-2 failures are
   * wall-clock timeouts, and every one of them passes in isolation. A second worker means a
   * second Chromium, which makes the starvation that causes those timeouts worse, not better,
   * so parallelism is the wrong lever here until the suite runs somewhere with more headroom.
   */
  workers: 1,
  /**
   * The timeouts above are environmental, not assertion failures, and they land on a different
   * set of tests each run - the moving target that says "budget", not "bug". One retry converts
   * that class into a `flaky` line in the report, which still names the test rather than hiding
   * it, while a test that genuinely fails twice is still reported failed.
   */
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    // Was `retain-on-failure`, which records a trace for all 258 tests and throws away 255 of
    // them. Measured on axe.spec.ts/mobile, quiet machine, best of three: 20.9 s of CPU with
    // tracing against 16.8 s without, for the same 4 passing tests. `on-first-retry` pays that
    // only for a test that has actually failed once - and, with `retries: 1`, still produces a
    // trace for every real failure.
    trace: 'on-first-retry',
  },
  /**
   * Plan v2 6.13. The mobile checks (no horizontal scroll, 44 point tap targets, safe area
   * padding present) run at all three phone sizes, not only at 375x812. 375x812 stays the
   * SMALLEST supported size and is not dropped; the two new profiles are the current iPhone
   * Pro and Pro Max, which is what a person actually installing this to a Home Screen has.
   *
   * All three are Chromium with touch emulation rather than WebKit, because that is what is
   * installed here and because criteria 20a and 20b are about CSS `env()` resolution and
   * reachable controls, both of which Chromium emulates. What Chromium cannot do is a real
   * Dynamic Island or home indicator, which is why 11.4 item 7 keeps a manual device check.
   */
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'iphone-pro',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'iphone-pro-max',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 430, height: 932 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
