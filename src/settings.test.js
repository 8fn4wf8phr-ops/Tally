import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCENT_THEMES,
  DEFAULT_ACCENT_THEME,
  getAccentTheme,
  normalizeReminderColor,
  getReminderColorHex,
  REMINDER_COLORS,
  normalizeGreetingStyle,
  graceOccurrencesForHours,
  isWithinQuietHours,
} from './settings.js';

test('normalizeGreetingStyle keeps valid styles and defaults anything else to simple', () => {
  assert.equal(normalizeGreetingStyle('detailed'), 'detailed');
  assert.equal(normalizeGreetingStyle('simple'), 'simple');
  assert.equal(normalizeGreetingStyle(null), 'simple');
  assert.equal(normalizeGreetingStyle('bogus'), 'simple');
});

test('accent themes include the six offered colors', () => {
  assert.deepEqual(Object.keys(ACCENT_THEMES), ['teal', 'coral', 'violet', 'sky', 'indigo', 'mint']);
  assert.equal(getAccentTheme('indigo').accent, '#6c7ce0');
  assert.equal(getAccentTheme('mint').accent, '#5fd9b0');
});

test('reminder palette has 11 colors with unique ids and hexes', () => {
  assert.equal(REMINDER_COLORS.length, 11);
  assert.equal(new Set(REMINDER_COLORS.map(c => c.id)).size, 11);
  assert.equal(new Set(REMINDER_COLORS.map(c => c.hex)).size, 11);
});

test('normalizeReminderColor keeps known ids and turns everything else into null', () => {
  assert.equal(normalizeReminderColor('amber'), 'amber');
  assert.equal(normalizeReminderColor('nope'), null);
  assert.equal(normalizeReminderColor(undefined), null);
  assert.equal(normalizeReminderColor(null), null);
  assert.equal(normalizeReminderColor('toString'), null);
});

test('getReminderColorHex resolves ids and returns null for no color', () => {
  assert.equal(getReminderColorHex('slate'), '#7d8ba1');
  assert.equal(getReminderColorHex(null), null);
});

test('getAccentTheme returns the requested theme', () => {
  assert.equal(getAccentTheme('coral').accent, '#ff6b6b');
});

test('getAccentTheme falls back to the default for an unknown id', () => {
  assert.equal(getAccentTheme('nonexistent'), ACCENT_THEMES[DEFAULT_ACCENT_THEME]);
  assert.equal(getAccentTheme(undefined), ACCENT_THEMES[DEFAULT_ACCENT_THEME]);
});

test('graceOccurrencesForHours maps the four picker options', () => {
  assert.equal(graceOccurrencesForHours(0), 0);
  assert.equal(graceOccurrencesForHours(12), 0);
  assert.equal(graceOccurrencesForHours(24), 1);
  assert.equal(graceOccurrencesForHours(48), 2);
});

test('isWithinQuietHours is false when disabled', () => {
  assert.equal(isWithinQuietHours(23, 0, { enabled: false, start: '22:00', end: '07:00' }), false);
});

test('isWithinQuietHours handles a same-day range', () => {
  const range = { enabled: true, start: '13:00', end: '15:00' };
  assert.equal(isWithinQuietHours(12, 59, range), false);
  assert.equal(isWithinQuietHours(13, 0, range), true);
  assert.equal(isWithinQuietHours(14, 30, range), true);
  assert.equal(isWithinQuietHours(15, 0, range), false);
});

test('isWithinQuietHours handles an overnight range crossing midnight', () => {
  const range = { enabled: true, start: '22:00', end: '07:00' };
  assert.equal(isWithinQuietHours(21, 59, range), false);
  assert.equal(isWithinQuietHours(22, 0, range), true);
  assert.equal(isWithinQuietHours(23, 30, range), true);
  assert.equal(isWithinQuietHours(0, 0, range), true);
  assert.equal(isWithinQuietHours(6, 59, range), true);
  assert.equal(isWithinQuietHours(7, 0, range), false);
  assert.equal(isWithinQuietHours(12, 0, range), false);
});

test('isWithinQuietHours treats a zero-length window as quieting nothing', () => {
  const range = { enabled: true, start: '09:00', end: '09:00' };
  assert.equal(isWithinQuietHours(9, 0, range), false);
  assert.equal(isWithinQuietHours(12, 0, range), false);
});
