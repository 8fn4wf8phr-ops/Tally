// Pure logic for the Settings screen's new customization areas (accent
// theme, reminder defaults, quiet hours) — DOM/Capacitor-free, same pattern
// as streak.js / personalization.js.

// ---- Greeting style ----
// 'simple' is the plain "Good morning, {name}"; 'detailed' also surfaces
// what's still on today's list. Simple is the default so nothing changes
// for anyone until they opt in.
export const GREETING_STYLES = [
  { value: 'simple', label: 'Simple' },
  { value: 'detailed', label: 'Detailed' },
];

export const DEFAULT_GREETING_STYLE = 'simple';

export function normalizeGreetingStyle(value) {
  return GREETING_STYLES.some(s => s.value === value) ? value : DEFAULT_GREETING_STYLE;
}

// ---- Accent theme ----
// "Teal" is #00d4c4 — this is now the app's one formally-named default
// accent, replacing the old ad-hoc #0ea383 that was never actually named
// anywhere in the UI.
export const ACCENT_THEMES = {
  teal: { label: 'Teal', accent: '#00d4c4', accentDark: '#00a89a', accentLight: '#d7f7f3' },
  coral: { label: 'Coral', accent: '#ff6b6b', accentDark: '#e14b4b', accentLight: '#ffe1e1' },
  violet: { label: 'Violet', accent: '#9b7fd4', accentDark: '#7c5fc0', accentLight: '#ece4f9' },
  sky: { label: 'Sky', accent: '#4ea8de', accentDark: '#2f86c0', accentLight: '#dcf0fb' },
};

export const DEFAULT_ACCENT_THEME = 'teal';

export function getAccentTheme(id) {
  return ACCENT_THEMES[id] || ACCENT_THEMES[DEFAULT_ACCENT_THEME];
}

// ---- Reminder defaults ----
export const GRACE_PERIOD_OPTIONS = [0, 12, 24, 48];

export const DEFAULT_REMINDER_DEFAULTS = {
  gracePeriodHours: 24,
  soundEnabled: true,
};

// Streaks are tracked by calendar date (see streak.js's todayKey), not
// timestamp, so grace only has meaningful granularity at the level of whole
// scheduled occurrences. 0h and 12h are indistinguishable in that model —
// both mean "no occurrence may be missed" — which is a real limitation of
// offering an hours-based picker over a date-based streak engine, not a bug.
export function graceOccurrencesForHours(hours) {
  if (hours >= 48) return 2;
  if (hours >= 24) return 1;
  return 0;
}

// ---- Quiet hours ----
export const DEFAULT_QUIET_HOURS = { enabled: false, start: '22:00', end: '07:00' };

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Handles ranges that cross midnight (e.g. 22:00 -> 07:00) as well as
// same-day ranges (e.g. 13:00 -> 15:00).
export function isWithinQuietHours(hour, minute, quietHours) {
  if (!quietHours || !quietHours.enabled) return false;
  const t = hour * 60 + minute;
  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  if (start === end) return false; // a zero-length window quiets nothing
  if (start < end) {
    return t >= start && t < end;
  }
  return t >= start || t < end; // overnight range
}
