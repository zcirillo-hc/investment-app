// Plan v2 section 9: every UI string lives here. Terms use [[key]] or [[key|text]] and render
// through RichText. No em dashes and no en dashes anywhere, enforced by `npm run lint:copy`.
// No shame language, especially around a non skip (R4.7): a nudge left alone produces no copy
// at all, which is why there is no string in this file for one.
import { formatCents, formatDollars } from '../domain/money';
import { formatMinuteOfDay } from '../domain/dates';
import { LEARN_SURFACE_LINE, NOT_ADVICE_LINE } from './learn';

export const S = {
  appName: 'Spare Change',
  mission: 'Keep a little. It goes a long way.',
  loading: 'Getting your jar ready.',

  nav: { home: 'Home', places: 'Places', invest: 'Invest', lessons: 'Lessons', settings: 'Settings' },

  errorBoundary: {
    title: 'This jar got stuck.',
    body: 'Something in the saved data on this device cannot be shown. Resetting the demo clears it and starts over from Welcome.',
    reset: 'Reset demo',
  },

  common: {
    continue: 'Continue',
    back: 'Back',
    close: 'Close',
    gotIt: 'Got it',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    tooltipHint: 'Tap for a quick explanation',
    // Plan v2 6.13: a standalone launch has no browser back button, so these name the way back.
    backToHome: 'Back to Home',
    backToLessons: 'Back to the confidence path',
    backToLearn: 'Back to Learn',
    backToInvest: 'Back to Invest',
    notNow: 'Not now',
    dismiss: 'Dismiss',
  },

  welcome: {
    headline: 'Keep a little. It goes a long way.',
    explanation:
      'Spare Change notices where you spend without thinking about it. Right before you usually go, it asks if you want to skip today. If you do, the money you were about to spend goes in your jar instead.',
    how: [
      { title: 'Notice', body: 'You go to the same coffee place three mornings a week. The app works that out on its own.' },
      // 9.1 step 2. The old wording named a specific number of minutes. It is dropped because
      // a push notification can no longer promise one (6.8, 9.4a), and the app should not claim
      // more precision than it delivers.
      { title: 'Ask once', body: 'Before your usual time, one question. Skip today? Say no and nothing happens.' },
      { title: 'Keep it', body: 'Skipping puts what you usually spend there into your jar. When you are ready, you move it somewhere real and tell the app where it went.' },
    ],
    nameLabel: 'What should we call you?',
    namePlaceholder: 'Your first name',
    emailLabel: 'Email (optional)',
    emailPlaceholder: 'you@school.edu',
    // 9.4. The v1 privacy promise is deleted from the product: with a push backend it was
    // false for anyone who turned nudges on, and a promise that is true for most people is not
    // a promise. `lint:copy` bans the old sentence outright, which is also why it is not
    // quoted here. This one stays true in every state of the app, including with nudges on.
    noPassword: 'No account, no password. Your spending, your places, your jar and everything you type stay on this device.',
    nameRequired: 'Add a name so we know who this jar belongs to.',
    nameTooLong: 'Keep the name under 40 characters.',
    emailInvalid: 'That does not look like an email. You can also leave it blank.',
    demoNote: 'This is a demo. Your spending here is made up, and no real money moves.',
    importLink: 'Have a backup? Import it',
    importBad: 'That file is not a Spare Change export. Nothing changed.',
  },

  summer: {
    title: 'Summer money',
    // Plan v2 6.13 names Summer Money as revisitable after onboarding, so the same screen has
    // a second pair of controls: save what changed, and go back.
    saveChanges: 'Save',
    saved: 'Saved.',
    earnedLabel: 'How much did you make this summer?',
    leftLabel: 'How much is left?',
    ageLabel: 'How old are you?',
    defaultNote: 'We will use $3,000 as an example.',
    curveNow: 'Start now',
    curveLater: 'Start at 30',
    // R10.1. Takes the age so the title cannot drift from the curve underneath it.
    chartTitle: (startAge: number) => `Keeping 10% of every summer paycheck from ${startAge}, next to waiting until 30`,
    chartTitleGeneric: 'Keeping 10% of every summer paycheck, next to waiting until 30',
    // Plain language pass. The old line was one telegraphic sentence with a colon and two
    // figures and it never said WHY the gap was so large, which is the only interesting part.
    // Three short sentences now: what it costs you, what you get, and where the gap comes from.
    chartIntro: 'Here is what keeping a little every summer adds up to. This is a picture, not a plan you have to sign up for.',
    headline: (diff: number, extra: number, startAge: number) =>
      `Starting at ${startAge} means putting in ${formatDollars(extra)} more than someone who waits until 30. That comes out to about ${formatDollars(diff)} more at 65. Most of that gap is time doing the work, not the extra you put in.`,
    assumption: 'Assumes [[sevenPercent]] a year, which is a guess based on the long run past. Nobody knows the real number.',
    leftLine: (keep: number) => `Ten percent of what you have left is ${formatCents(keep)}. Small enough that you would not feel it go, which is the whole point.`,
    ageOption: (age: number) => `${age}`,
    axisAge: 'Age',
    // R10.4. The grounded companion to the two hypothetical curves above: real money the user
    // kept and recorded, on its own scale. Wording stays an assumption, never a promise (R15).
    yourMoneyTitle: 'Your money',
    yourMoneyChartTitle: 'What you have put in so far, if you left it alone',
    yourMoneyPutIn: (cents: number) => `You have kept ${formatCents(cents)} so far.`,
    yourMoneyHeadline: (end: number, age: number) =>
      `If you left that alone it could be about ${formatDollars(end)} by the time you are 65. You are ${age}, so it has a long time to sit there and grow.`,
    yourMoneyEmpty: 'Nothing in here yet. Your first skip starts this line, and it really does not have to be much.',
    yourMoneyNote: 'This only counts what you kept and what you told us you moved. It cannot see your real accounts, so it does not know what that is worth today.',
  },

  fear: {
    question: "What's the one thing that's stopped you before?",
    sub: 'Pick the one that sounds most like you. Your first lesson answers it.',
    options: {
      rent: 'I might need it for rent.',
      pointless: 'Twenty bucks a week feels pointless.',
      confused: "I don't really get how investing works.",
      losing: "I'm scared of losing it.",
    },
  },

  home: {
    summerLink: 'See the summer money numbers again',
    keptSinceStart: 'Kept since you started',
    keptThisSummer: 'Kept this summer',
    byThirty: (dollars: number) => `By 30 that is about ${formatDollars(dollars)}`,
    byThirtyTip: 'at [[sevenPercent]] a year',
    weekKept: 'This week',
    skipsThisWeek: 'Skips this week',
    daysIn: 'Days in',
    movedLabel: '[[contributions|Moved into investments]]',
    // Plan 9.3. The honest line that replaces the growth figure.
    movedLine: (total: number) =>
      `You have moved ${formatCents(total)} into investments. This app does not know what that is worth today, and it never will. It is not connected to your money.`,
    jarTitle: 'Your [[jar]]',
    jarLabel: (cents: number, goal: number) => `${formatCents(cents)} of ${formatCents(goal)}`,
    jarGoalReached: 'Jar goal reached. Nothing has to happen next.',
    moveToInvestment: 'I moved this into an investment',
    spentIt: 'I spent it',
    jarEmpty: 'Nothing in the jar yet. Round-ups, catches and skips all land here.',
    treeTitle: 'Your tree',
    treeCaption: (stageName: string, days: number | null) =>
      days === null ? 'A seed. It sprouts the first time you keep something.' : `${stageName}, ${days} ${days === 1 ? 'day' : 'days'} of keeping`,
    todayNothing: 'Today: nothing yet.',
    today: (roundUps: number, catches: number, skips: number, cents: number) => {
      const parts: string[] = [];
      if (roundUps > 0) parts.push(`${roundUps} ${roundUps === 1 ? '[[roundUp|round-up]]' : '[[roundUp|round-ups]]'}`);
      if (catches > 0) parts.push(`${catches} ${catches === 1 ? '[[catch]]' : '[[catch|catches]]'}`);
      if (skips > 0) parts.push(`${skips} ${skips === 1 ? '[[skip]]' : '[[skip|skips]]'}`);
      return `Today: ${parts.join(', ')}, ${formatCents(cents)} kept.`;
    },
    nextLesson: 'Next lesson',
    nextLessonNew: 'New',
    noLesson: 'Nothing new yet. Keep going.',
    activityLink: 'See all activity',
    milestonesLink: 'Your milestones',
    autoAdvance: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} went by. Your jar kept working.`,
    demoHint: 'Tip: long-press the logo for demo controls.',
  },

  // Plan 9.2. One card, one sentence, two buttons.
  nudge: {
    title: (place: string) => `Skip ${place} today?`,
    body: (estimate: number, minute: number) =>
      `You usually spend about ${formatCents(estimate)} here around ${formatMinuteOfDay(minute)}. Skip today and it goes in your jar.`,
    estimateLabel: 'That amount is an [[estimate]] of what you usually spend here.',
    skip: "I'm skipping today",
    notToday: 'Not today',
    toast: (estimate: number) => `${formatCents(estimate)} in the jar. That is money you already had.`,
    kicker: 'Your usual stop',
  },

  jarMove: {
    title: 'Where did it go?',
    banner: (cents: number) => `${formatCents(cents)} moved out of the jar and into your records.`,
    spentTitle: 'Empty the jar?',
    spentBody: 'This sets the jar back to zero and writes one neutral line in your activity. It is your money.',
    spentConfirm: 'Yes, empty it',
    spentDone: 'Jar emptied. It was your money.',
  },

  activity: {
    title: 'Activity',
    sub: 'Every [[roundUp|round-up]], [[catch]] and [[skip]], newest first.',
    emptyTitle: 'Nothing here yet.',
    // The empty state prints the title above this line, so the two do not repeat each other.
    empty: 'Everything you keep shows up here. Tap Next day in the demo tray, or come back tomorrow.',
    roundUp: (merchant: string, purchase: number, kept: number) => `${merchant}, ${formatCents(purchase)}. Kept ${formatCents(kept)}.`,
    catch: (paycheck: number, kept: number) => `Paycheck landed, ${formatCents(paycheck)}. Kept ${formatCents(kept)}.`,
    skip: (place: string, kept: number) => `Skipped ${place}. Kept ${formatCents(kept)}, an [[estimate]] of what you usually spend there.`,
    jarMove: (cents: number) => `Moved ${formatCents(cents)} out of the jar into an investment you recorded.`,
    jarEmptied: (cents: number) => `Jar emptied, ${formatCents(cents)}. It was your money.`,
    kindLabel: { RoundUp: 'Round-up', Catch: 'Catch', Skip: 'Skip', JarMove: 'Moved', JarEmptied: 'Emptied' } as Record<string, string>,
  },

  // Plan 8.6 and 9.4.
  places: {
    title: 'Places',
    sub: 'What we worked out from your own spending.',
    privacyTitle: 'Where this comes from',
    // 9.4 again: the standing line, plus what this particular screen inferred. The old body
    // claimed there is no server, which stopped being true when nudges gained one (6.0).
    privacyBody:
      'Spare Change works out your regular places from your own spending, on this device. No account, no password. Your spending, your places, your jar and everything you type stay on this device. That stays true with nudges on: a place name or an amount is never sent anywhere, including in a nudge.',
    locationOff: 'Location is off, and nothing is missing. Every [[place]] here came from your spending.',
    emptyTitle: 'No places yet.',
    empty: 'They appear once you have spent somewhere a few times. There is nothing to set up.',
    visits: (n: number) => `${n} ${n === 1 ? 'visit' : 'visits'} in the last 14 days`,
    usualTime: (minute: number) => `[[usualTime|Usual time]] about ${formatMinuteOfDay(minute)}`,
    noUsualTime: 'No usual time yet',
    statusHabit: 'A [[habit]]. We can ask about this one.',
    statusIrregular: 'You go here, but not at a regular time, so we leave it alone.',
    statusNotEnough: 'Not enough visits in the last 14 days to call it a [[habit]].',
    estimate: (cents: number) => `About ${formatCents(cents)} a visit`,
    estimateLabel: 'an [[estimate]] of what you usually spend here',
    mute: 'Mute',
    muted: 'Muted',
    muteLabel: (place: string) => `Mute nudges for ${place}`,
    deleteOne: 'Delete',
    deleteLabel: (place: string) => `Delete ${place}`,
    deleteConfirm: (place: string) => `This removes ${place} and everything we worked out about it. The money you already kept stays in your activity.`,
    deleteYes: 'Yes, delete it',
    deleteAll: 'Delete every place and visit',
    deleteAllConfirm: 'This removes every place and every visit. The money you already kept stays in your activity.',
    deleteAllYes: 'Yes, delete them all',
    nudgesOffNote: 'Nudges are off, so nothing here will ask you anything. Habits are still worked out.',
    turnOnNudges: 'Turn nudges on',
  },

  // Plan 8.7 and 9.3.
  invest: {
    title: 'Invest',
    sub: 'What you told us you put in.',
    // R15.6 and 9.8a, cycle 8: the same sentence, verbatim, on all six surfaces.
    notAdvice: NOT_ADVICE_LINE,
    count: (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
    since: (date: string) => `since ${date}`,
    empty: 'Nothing recorded yet.',
    add: 'Add what you invested',
    // The empty state offers both ways in at once, and "Add what you invested" beside "What
    // are you invested in?" reads as the same button twice. This is the short second one.
    addOne: 'Add one myself',
    formTitle: 'Add what you invested',
    editTitle: 'Edit this entry',
    amount: 'How much',
    date: 'When',
    what: 'What it went into',
    whatPlaceholder: 'Index fund',
    note: 'Note (optional)',
    disclaimer: 'We do not check this against anything and we never track a price for it.',
    jarSourced: 'This one came out of your jar.',
    deleteWarn: 'Deleting this entry does not put the money back in your jar.',
    deleteYes: 'Yes, delete it',
    errAmount: 'Enter an amount over zero.',
    errAmountTooLarge: 'That amount is larger than this app will record.',
    errDate: 'Enter a real date.',
    errDateFuture: 'That date has not happened yet.',
    errWhat: 'Say what it went into.',
    errWhatTooLong: 'Keep that under 60 characters.',
    errNoteTooLong: 'Keep the note under 200 characters.',
    savedToast: 'Recorded. That is all we do with it.',
  },

  // Plan 8.7a and 9.7a.
  capture: {
    title: 'What are you invested in?',
    subhead:
      'Tell us what you already put money into, in your own words. We only ever record what you type. We do not check it against anything, and we never work out what it is worth.',
    otherPlaceholder: 'Say what it is.',
    amountLabel: 'How much.',
    save: 'Add to my ledger.',
    remove: (label: string) => `Remove ${label}`,
    chipHint: 'Tap what you have. Add an amount for each one.',
    emptyEntryTitle: 'What are you invested in?',
    emptyEntryBody: 'Add what you already have, in your own words. It takes a minute.',
    // The empty state already asks the question as its heading, so its button says what
    // tapping it does rather than repeating the heading word for word.
    emptyEntryCta: 'Pick from a list',
    secondaryEntry: 'What are you invested in?',
    promptTitle: 'One more thing, if you want.',
    promptBody: 'Tell us what you are already invested in. This is optional, and you can do it any time from Invest.',
    promptAdd: 'Add it now',
    promptSkip: 'Skip for now',
    errLabel: 'Say what it is.',
    errLabelTooLong: 'Keep that under 60 characters.',
    savedToast: (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'} added to your ledger.`,
  },

  lessons: {
    title: 'Confidence path',
    sub: 'Short lessons that unlock as things happen. Skip any of them, none are required.',
    // R15.6, rewritten by the cycle 8 amendment (9.8a). It used to appear in three places and
    // deliberately not per piece, because a disclaimer on every paragraph reads as
    // nervousness. The amendment keeps that reasoning against repeating a PARAGRAPH and drops
    // it for one short line: the library and the lessons may now state general principles, and
    // a reader who deep links into a single piece would otherwise be the one person who never
    // sees the sentence that makes them education. Six surfaces now, same words in each.
    notAdvice: NOT_ADVICE_LINE,
    learnLink: 'There is more, whenever you want it.',
    ring: (read: number, total: number) => `${read} of ${total}`,
    ringLabel: 'lessons read',
    // The ring draws the count itself now, so the words beside it name the thing rather than
    // repeating the number. `ring` and `ringLabel` still compose the sentence screen readers get.
    ringTitle: 'Lessons read',
    ringHint: (left: number) => (left === 0 ? 'All eight, done.' : `${left} more, whenever you want them.`),
    state: { locked: 'Locked', new: 'New', read: 'Read' },
    lockedHint: (hint: string) => hint,
    notYet: 'This one is still locked.',
    backToPath: 'Back to the path',
    pathDone: 'Path complete. You know more than most people who invest.',
  },

  settings: {
    title: 'Settings',
    profileTitle: 'Profile',
    name: 'Name',
    email: 'Email',
    profileNote: 'Just so the app knows who you are. Nothing is sent anywhere.',
    nameInvalid: 'Keep the name between 1 and 40 characters. Your old name is still saved.',
    emailInvalid: 'That does not look like an email, so it was not saved. You can also leave it blank.',
    pauseRoundUps: 'Pause round-ups',
    pauseNote: 'Purchases still happen, but nothing goes in the [[jar]] until you turn this back on.',
    jarGoalTitle: 'Jar goal',
    jarGoalNote: 'Just a line on the jar. Nothing moves when you reach it, and nothing has to happen next.',
    jarGoalOption: (cents: number) => formatDollars(cents / 100),
    catchTitle: 'Paycheck [[catch]]',
    catchNote: 'The slice we suggest keeping from each paycheck. You can change it on any single paycheck too.',
    catchPct: (pct: number) => `${pct}%`,
    catchMinus: 'Lower the usual percentage',
    catchPlus: 'Raise the usual percentage',
    mutedTitle: 'Muted places',
    mutedNone: 'Nothing is muted.',
    unmute: 'Unmute',
    dataTitle: 'Your data',
    exportBtn: 'Export JSON',
    importBtn: 'Import JSON',
    dataNote: 'Your places, your jar, your ledger and your lessons live in this browser. Export to keep a copy or move it to another device.',
    importOk: 'Imported. Reloading.',
    importBad: 'That file is not a Spare Change export. Nothing changed.',
    importV1: 'That is a Spare Change v1 backup. v1 saved a simulated portfolio that v2 does not have, so it cannot be brought across. Nothing changed.',
    deletePlaces: 'Delete every place and visit',
    reset: 'Reset demo',
    resetConfirm: 'Yes, reset everything',
    resetNote: 'Wipes this device and starts over from Welcome.',
    storageFallback: 'Storage is unavailable in this browser session, so changes will not survive a reload.',
    noCharge: 'This demo does not charge you anything and does not touch your money.',
    notAdvice: NOT_ADVICE_LINE,
    deleteEverything: 'Delete everything',
    deleteEverythingConfirm:
      'This deletes the server row if you have one, then everything Spare Change has stored in this browser: your places, your jar, your ledger, your lessons. It cannot be undone and there is no copy anywhere else.',
    deleteEverythingYes: 'Yes, delete everything',
    // The one action in the app that can fail halfway, so it reports what it did (6.9).
    deleteEverythingDone: (server: 'deleted' | 'not-reached' | 'none', local: boolean) =>
      `${
        server === 'deleted'
          ? 'The server row is gone.'
          : server === 'not-reached'
            ? 'We could not reach the server to delete the row, so it will be deleted the next time it fails to reach you, and in any case within ninety days.'
            : 'There was no server row to delete.'
      } ${local ? 'Everything stored in this browser is cleared.' : 'Some of this browser storage could not be cleared.'}`,
    themeTitle: 'Appearance',
    themeNote: 'System follows your device. Dark mode is here from day one.',
    theme: { system: 'System', light: 'Light', dark: 'Dark' },
    version: (v: string) => `Spare Change v${v}, demo build. Nothing here moves real money.`,
  },

  // Plan v2 8.9 and 9.8. The library. Every piece is readable from day 0 (R12.5), so nothing
  // in here has a locked state, an unlock hint, or a percentage complete.
  learn: {
    title: 'Learn',
    sub: 'Sixteen short reads. Nothing here is locked, and nothing has to be read in order.',
    notAdvice: NOT_ADVICE_LINE,
    progress: (read: number, total: number) => `${read} of ${total} read`,
    readBadge: 'Read',
    // Per track, beside its title, and on a reader page. Plain counts, never a percentage:
    // criterion 27 greps the library screen for a "%" and there must not be one.
    trackCount: (read: number, total: number) => `${read} of ${total}`,
    trackPosition: (index: number, total: number) => `${index} of ${total} in this track`,
    // R12.5: a surfacing card highlights a piece that was already readable and stays readable.
    // The one line reason for each is content, so it lives in shared/content/learn.json.
    surface: LEARN_SURFACE_LINE,
    surfaceOpen: 'Read it',
  },

  // Plan v2 8.10, 9.4a to 9.4d and 9.5. The Nudges card, and the only place in the app where
  // the server is visible.
  nudges: {
    title: 'Nudges',
    toggle: 'Ask me before my usual stops',
    what: 'One question before your usual time, at most one a day. Say no and nothing happens.',
    explainerLink: 'What this changes',
    on: 'Nudges are on for this browser.',
    // Test report V2-1. In `denied`, `needs-ios-install` and `unsupported` the toggle turns
    // the in app nudge on without ever subscribing, so nothing is sent anywhere and no
    // notification can arrive. Saying "on for this browser" there would be an over-claim in
    // the same family as the retired privacy promise, just pointing the other way.
    onAppOnly: 'Nudges are on, in the app. No notification will arrive on this browser.',
    off: 'Nudges are off.',
    quietHours: (start: number, end: number) =>
      `[[quietHours|Quiet hours]]: we only ask between ${formatMinuteOfDay(start)} and ${formatMinuteOfDay(end)}.`,
    // A10: quiet hours are fixed this cycle, and the UI must not appear to offer editing.
    quietHoursFixed: 'That window is fixed for now.',
    storedTitle: 'What is on the server while nudges are on',
    storedLine:
      'Three things: an address your browser hands out so a notification can reach it, your time zone, and the minute to wake you.',
    // The honest counterpart, shown whenever nudges are on and nothing was ever subscribed.
    notStoredTitle: 'Nothing is on the server',
    notStoredLine:
      'Nudges are running on this device only. Nothing has been sent anywhere, so there is no row to delete. When one is due you will find it on Home the next time you open the app.',
    endpointLabel: (hash: string) => `This browser is known to the server as ${hash}.`,
    unsupported: 'This browser cannot do notifications, so nudges will not arrive here. The nudge card on Home still works.',
    unreachable: 'We could not reach the nudge service. Everything else still works.',
    retry: 'Try again',
    scheduleFailed: 'Nudges are on, but the next one could not be scheduled. Everything else still works.',

    // 9.4a. Shown in full, with a continue button, before any permission prompt.
    explainerTitle: 'What turning nudges on changes',
    explainerBody:
      'A web app cannot wake itself up on its own, so a nudge has to come from a server. If you turn nudges on, three things get stored there: an address your browser hands out so a notification can reach it, your time zone, and the minute to wake you. That is the whole row.',
    explainerBody2:
      'The place, the amount, your jar and everything you have typed stay here. The words in the notification are written on this device, after it wakes up, which is why the server never needs to know where you go.',
    explainerBody3:
      'Turn nudges off and that row is deleted. There is no second row anywhere, no backup, and no account it is attached to.',
    // Added by the cycle 7 amendment 3. Deleted or rewritten the day the cadence changes (6.8a).
    explainerBody4:
      'One more honest thing: right now this arrives once a day, in an early morning window, rather than at the exact minute before you usually go. Some mornings it will show up earlier than that. It will not show up after your usual time has already passed.',
    explainerYes: 'Turn nudges on',
    explainerNo: 'Not now',

    // 9.4b. iPhone and iPad Safari, before Add to Home Screen.
    installTitle: 'Add Spare Change to your Home Screen first',
    installBody:
      'iPhone only lets a website send notifications once you have added it to your Home Screen. It takes three taps and it does not install anything from an app store.',
    installStep1: 'Tap the Share button at the bottom of Safari.',
    installStep2: 'Scroll down the list and tap Add to Home Screen.',
    installStep3: 'Open Spare Change from your Home Screen, then come back to this screen.',
    installFooter: 'Everything else in the app works exactly the same either way. Nudges are the only part that needs this.',

    // 9.4c. Permission already denied. No prompt is ever attempted again.
    deniedTitle: 'Notifications are blocked for this site',
    deniedBody:
      "Your browser is turned down for Spare Change, and only you can change that, in your browser's settings for this page. We are not going to keep asking.",
    deniedBody2:
      'Nothing is broken. When a nudge is due it is still waiting for you on Home the next time you open the app.',

    // 9.4d. The optional install button, where beforeinstallprompt fires.
    installAppBtn: 'Install Spare Change',
    installAppNote: 'Puts it in its own window. Nudges work either way on this browser, so this is only if you want it.',

    // 9.5.
    turnOff: 'Turn nudges off',
    turnOffConfirm:
      'This deletes the row on the server, right now. Your places, your jar and everything you have kept stay exactly where they are.',
    turnOffConfirmLocal:
      'This turns nudges off here. There is nothing on the server to delete, because nothing was ever sent. Your places, your jar and everything you have kept stay exactly where they are.',
    turnOffDone: 'Nudges are off and the server row is gone.',
    turnOffDoneLocal: 'Nudges are off. There was nothing on the server to delete.',
    turnOffOffline:
      'Nudges are off on this device. We could not reach the server to delete the row, so it will be deleted the next time it fails to reach you, and in any case within ninety days. You can try again.',
    // R14.3: a browser that cannot resolve a zone sends UTC and is told so plainly.
    tzFallback: 'This browser will not tell us its time zone, so nudges may arrive at the wrong time.',
  },

  catchSheet: {
    landed: (cents: number) => `A paycheck landed: ${formatCents(cents)}`,
    question: (pct: number, cents: number) => `Keep ${pct}% of this before it's gone? That is ${formatCents(cents)}.`,
    questionPrefix: (pct: number) => `Keep ${pct}% of this before it's gone? That is `,
    accept: (cents: number) => `Yes, keep ${formatCents(cents)}`,
    decline: 'Not this time',
    changePct: 'Change %',
    pctLabel: 'Keep this much of this paycheck',
    thisDepositOnly: 'This deposit only. Your usual percentage stays the same.',
    title: 'Paycheck [[catch]]',
    minus: 'Lower the percentage',
    plus: 'Raise the percentage',
  },

  demo: {
    title: 'Demo controls',
    collapse: 'Hide',
    open: 'Demo',
    date: 'Simulated date',
    dayIndex: 'Day',
    seed: 'Seed',
    places: 'Places',
    habits: 'Habits',
    nudgeToday: 'Nudge today',
    nudgeNone: 'none',
    nextDay: 'Next day',
    skipWeek: 'Skip a week',
    landPaycheck: 'Land a paycheck',
    makeHabit: 'Make a habit',
    forceNudge: 'Force a nudge now',
    forceSummer: (state: 'auto' | 'on' | 'off') => `Summer: ${state}`,
    reset: 'Reset demo',
  },

  milestones: {
    title: 'Your milestones',
    first100Kept: 'First $100 kept',
    firstSummer: 'First summer done',
    pathFinished: 'Confidence path complete',
    saveImage: 'Save image',
    noneTitle: 'None yet, and that is fine.',
    none: 'The first one is $100 kept. It arrives on its own.',
    reached: (date: string) => `Reached ${date}`,
    cardSub: {
      first100Kept: 'kept, one skipped coffee at a time',
      firstSummer: 'a whole summer, kept',
      pathFinished: 'every lesson, zero lectures',
    },
    share: 'Screenshot it, send it, whatever you do.',
  },

  tree: {
    stages: ['seed', 'sprout', 'seedling', 'sapling', 'young tree', 'tree', 'full canopy'],
  },

  errors: {
  },
} as const;

export type Strings = typeof S;
