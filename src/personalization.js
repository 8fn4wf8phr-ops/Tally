// Pure name-personalization logic, kept free of DOM/Capacitor so it can be
// imported directly in tests (same pattern as streak.js).
//
// Every function takes `name` as a plain string or null/undefined — callers
// are responsible for reading it from Preferences and for keeping it out of
// innerHTML (use textContent/.value, not string interpolation into markup).

export function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  // 5pm through 4am reads as "evening" — there's no separate late-night bucket.
  return 'evening';
}

const GREETING_LABELS = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

export function getGreeting(name, date = new Date()) {
  const label = GREETING_LABELS[getTimeOfDay(date)];
  return name ? `${label}, ${name}` : label;
}

// ---- Contextual ("Detailed") greeting ----
// Exactly one reminder left today -> rotate through these; more than one ->
// a count-based line. Each named variant has a name-free counterpart at the
// same index so the tone stays matched without a name.
const DUE_ONE_NAMED = [
  '{title} is up next, {name}.',
  "Don't forget {title}, {name}.",
  'First up: {title}, {name}.',
  '{name}, {title} is on deck.',
];

const DUE_ONE_GENERIC = [
  '{title} is up next.',
  "Don't forget {title}.",
  'First up: {title}.',
  '{title} is on deck.',
];

export function getDueReminderPhrase(title, name, random = Math.random()) {
  const pool = name ? DUE_ONE_NAMED : DUE_ONE_GENERIC;
  const template = pool[Math.floor(random * pool.length)];
  return template.replace('{title}', title).replace('{name}', name || '');
}

export function getDueCountMessage(count, name) {
  return name ? `${count} left on your list today, ${name}.` : `${count} left on your list today.`;
}

// 'simple' (or nothing pending) is the plain time-of-day greeting; 'detailed'
// swaps in what's actually coming up.
export function getContextualGreeting({ style, pendingTitles, name, date = new Date(), random = Math.random() }) {
  if (style !== 'detailed' || pendingTitles.length === 0) return getGreeting(name, date);
  if (pendingTitles.length === 1) return getDueReminderPhrase(pendingTitles[0], name, random);
  return getDueCountMessage(pendingTitles.length, name);
}

const EMPTY_STATE_MESSAGES = {
  morning: {
    named: [
      'All clear, {name}. Ready for the day?',
      'Nothing on your plate yet, {name}.',
      'A clean slate this morning, {name}.',
    ],
    generic: [
      'All clear. Ready for the day?',
      'Nothing on the plate yet.',
      'A clean slate this morning.',
    ],
  },
  afternoon: {
    named: [
      'All caught up, {name}.',
      'Nothing pending right now, {name}.',
      'Clear skies this afternoon, {name}.',
    ],
    generic: [
      'All caught up.',
      'Nothing pending right now.',
      'Clear skies this afternoon.',
    ],
  },
  evening: {
    named: [
      'All done for today, {name}.',
      'Nothing left tonight, {name}. Nice work.',
      'Clear for the evening, {name}.',
    ],
    generic: [
      'All done for today.',
      'Nothing left tonight. Nice work.',
      'Clear for the evening.',
    ],
  },
};

export function getEmptyStateMessage(name, date = new Date(), random = Math.random()) {
  const pool = EMPTY_STATE_MESSAGES[getTimeOfDay(date)][name ? 'named' : 'generic'];
  const template = pool[Math.floor(random * pool.length)];
  return name ? template.replace('{name}', name) : template;
}

export const STREAK_MILESTONES = [7, 30, 100, 365];

const MILESTONE_LABELS = {
  7: 'One week strong',
  30: 'One month strong',
  100: '100 days strong',
  365: 'One year strong',
};

export function isStreakMilestone(streak) {
  return STREAK_MILESTONES.includes(streak);
}

export function getMilestoneMessage(streak, name) {
  const label = MILESTONE_LABELS[streak];
  if (!label) return null;
  return name ? `${label}, ${name} 🔥` : `${label} 🔥`;
}

// Small early-streak nudges, shown as a toast (the 7/30/100/365 milestones
// above get the full modal instead).
const STREAK_ACK_LABELS = {
  3: 'Three in a row',
  5: 'Five days',
};

export function isStreakAcknowledgment(streak) {
  return Object.hasOwn(STREAK_ACK_LABELS, streak);
}

export function getStreakAcknowledgment(streak, name) {
  const label = STREAK_ACK_LABELS[streak];
  if (!label) return null;
  const suffix = streak === 5 ? ' — building a habit' : '';
  return name ? `${label}, ${name}${suffix}.` : `${label}${suffix}.`;
}

// Low-pressure — deliberately no exclamation points or "you failed" framing.
const STREAK_RESET_MESSAGES_NAMED = [
  "Streak reset, {name} — let's start a new one.",
  'No worries, {name}. Fresh start today.',
  'Missed one, {name}. Back at it now.',
];

const STREAK_RESET_MESSAGES_GENERIC = [
  "Streak reset — let's start a new one.",
  'No worries. Fresh start today.',
  'Missed one. Back at it now.',
];

export function getStreakResetMessage(name, random = Math.random()) {
  const pool = name ? STREAK_RESET_MESSAGES_NAMED : STREAK_RESET_MESSAGES_GENERIC;
  const template = pool[Math.floor(random * pool.length)];
  return name ? template.replace('{name}', name) : template;
}

// Each named variant has a name-free counterpart at the same index so the
// tone stays roughly matched when there's no name to personalize with.
const NOTIFICATION_VARIANTS_NAMED = [
  '{name}, time for {title}',
  "Don't forget {title}, {name}",
  '{title} is up, {name}',
  'Hey {name}, {title} time',
];

const NOTIFICATION_VARIANTS_GENERIC = [
  'Time for {title}',
  "Don't forget {title}",
  '{title} is up',
  '{title} time',
];

export function getNotificationBody(title, name, random = Math.random()) {
  const variants = name ? NOTIFICATION_VARIANTS_NAMED : NOTIFICATION_VARIANTS_GENERIC;
  const template = variants[Math.floor(random * variants.length)];
  return template.replace('{title}', title).replace('{name}', name || '');
}
