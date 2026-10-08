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
// "Teal" (id kept for stored preferences) is the brand's Deep Teal #0a4750 —
// the app's one formally-named default accent. White text on it is 10.3:1.
export const ACCENT_THEMES = {
  teal: { label: 'Deep teal', accent: '#0a4750', accentDark: '#062f35', accentLight: '#dfe9df', dark: { accent: '#5cc0cb', accentDark: '#8dd3db', accentLight: '#1f5057' } },
  coral: { label: 'Coral', accent: '#ff6b6b', accentDark: '#e14b4b', accentLight: '#ffe1e1', dark: { accent: '#ff7b7b', accentDark: '#ffa3a3', accentLight: '#434045' } },
  violet: { label: 'Violet', accent: '#6b3ded', accentDark: '#5430c7', accentLight: '#e6defc', dark: { accent: '#a98bff', accentDark: '#c3aeff', accentLight: '#304462' } },
  sky: { label: 'Sky', accent: '#4ea8de', accentDark: '#2f86c0', accentLight: '#dcf0fb', dark: { accent: '#5fb4e8', accentDark: '#8fcaef', accentLight: '#204d5d' } },
  indigo: { label: 'Indigo', accent: '#6c7ce0', accentDark: '#4f5fc4', accentLight: '#e3e6fa', dark: { accent: '#8e9bf0', accentDark: '#b0b9f4', accentLight: '#2a485f' } },
  mint: { label: 'Mint', accent: '#5fd9b0', accentDark: '#34b98c', accentLight: '#daf7ed', dark: { accent: '#5fd9b0', accentDark: '#8fe4c8', accentLight: '#205551' } },
};

export const DEFAULT_ACCENT_THEME = 'teal';

// In dark mode the accent doubles as text/border/stroke on a dark surface, so
// each theme carries a lifted `dark` variant (all >= 5:1 against the dark card)
// and fills take dark ink instead of white — see --on-accent in style.css.
// Returns the same {accent, accentDark, accentLight} shape for either scheme.
export function getAccentTheme(id, scheme = 'light') {
  const theme = ACCENT_THEMES[id] || ACCENT_THEMES[DEFAULT_ACCENT_THEME];
  if (scheme === 'dark') return { label: theme.label, ...theme.dark };
  return theme;
}

// ---- Appearance (light / dark) ----
// 'system' follows iOS and is the default, so dark mode simply works for
// anyone already running iOS in dark. The stored value is its own
// preference key; the accent theme key is untouched.
export const APPEARANCE_MODES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const DEFAULT_APPEARANCE = 'system';

export function normalizeAppearance(value) {
  return APPEARANCE_MODES.some(m => m.value === value) ? value : DEFAULT_APPEARANCE;
}

// -> 'light' | 'dark'
export function resolveScheme(mode, systemPrefersDark) {
  const m = normalizeAppearance(mode);
  if (m === 'system') return systemPrefersDark ? 'dark' : 'light';
  return m;
}

// ---- Reminder defaults ----
export const GRACE_PERIOD_OPTIONS = [0, 12, 24, 48];

// defaultColor is a REMINDER_COLORS id, or null to follow the app's accent
// theme (which is what every reminder did before per-reminder colors existed).
export const DEFAULT_REMINDER_DEFAULTS = {
  gracePeriodHours: 24,
  soundEnabled: true,
  defaultColor: null,
};

// ---- Per-reminder colors ----
export const REMINDER_COLORS = [
  { id: 'teal', hex: '#0a4750', label: 'Deep teal' },
  { id: 'coral', hex: '#ff6b6b', label: 'Coral' },
  { id: 'amber', hex: '#ffb347', label: 'Amber' },
  { id: 'violet', hex: '#6b3ded', label: 'Violet' },
  { id: 'sky', hex: '#4ea8de', label: 'Sky' },
  { id: 'sage', hex: '#8fbc8f', label: 'Sage' },
  { id: 'rose', hex: '#f78fb3', label: 'Rose' },
  { id: 'gold', hex: '#e8c547', label: 'Gold' },
  { id: 'indigo', hex: '#6c7ce0', label: 'Indigo' },
  { id: 'mint', hex: '#5fd9b0', label: 'Mint' },
  { id: 'slate', hex: '#7d8ba1', label: 'Slate' },
];

// A stored id that's missing, unknown, or from an older palette means "no
// color" — the reminder just follows the accent theme.
export function normalizeReminderColor(id) {
  return REMINDER_COLORS.some(c => c.id === id) ? id : null;
}

export function getReminderColorHex(id) {
  return REMINDER_COLORS.find(c => c.id === id)?.hex ?? null;
}

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
