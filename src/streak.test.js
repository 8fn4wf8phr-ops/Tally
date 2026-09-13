import test from 'node:test';
import assert from 'node:assert/strict';
import { markReminderTaken, checkStaleStreaks, isOnGrace, getPreviousScheduledDate, todayKey } from './streak.js';

function makeReminder(overrides = {}) {
  return {
    id: 1,
    name: 'Test',
    time: '09:00',
    takenDate: null,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedDate: null,
    ...overrides,
  };
}

function dateKey(base, offsetDays) {
  return todayKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays));
}

const base = new Date(2024, 0, 10);

test('first completion starts a streak of 1', () => {
  const today = dateKey(base, 0);
  const result = markReminderTaken(makeReminder(), today);
  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 1);
  assert.equal(result.lastCompletedDate, today);
});

test('consecutive day completion increments the streak', () => {
  const yesterday = dateKey(base, -1);
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 3, longestStreak: 3, lastCompletedDate: yesterday });
  const result = markReminderTaken(reminder, today);
  assert.equal(result.currentStreak, 4);
  assert.equal(result.longestStreak, 4);
});

test('same-day tap does not double-count', () => {
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 2, longestStreak: 2, lastCompletedDate: today });
  const result = markReminderTaken(reminder, today);
  assert.equal(result.currentStreak, 2);
  assert.strictEqual(result, reminder);
});

test('a "today" earlier than lastCompletedDate is ignored (clock moved backward)', () => {
  const today = dateKey(base, 0);
  const tomorrow = dateKey(base, 1);
  const reminder = makeReminder({ currentStreak: 3, longestStreak: 3, lastCompletedDate: tomorrow });
  const result = markReminderTaken(reminder, today);
  assert.strictEqual(result, reminder);
  assert.equal(result.lastCompletedDate, tomorrow);
});

test('a 1-day gap is covered by the grace period', () => {
  const twoDaysAgo = dateKey(base, -2);
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 5, longestStreak: 5, lastCompletedDate: twoDaysAgo });
  const result = markReminderTaken(reminder, today);
  assert.equal(result.currentStreak, 6);
});

test('a 2+ day gap breaks the streak', () => {
  const fourDaysAgo = dateKey(base, -4);
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 7, longestStreak: 7, lastCompletedDate: fourDaysAgo });
  const result = markReminderTaken(reminder, today);
  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 7);
});

test('longest streak tracks the current streak high-water mark', () => {
  const yesterday = dateKey(base, -1);
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 2, longestStreak: 5, lastCompletedDate: yesterday });
  const result = markReminderTaken(reminder, today);
  assert.equal(result.currentStreak, 3);
  assert.equal(result.longestStreak, 5);
});

test('checkStaleStreaks resets a broken streak on launch', () => {
  const fourDaysAgo = dateKey(base, -4);
  const today = dateKey(base, 0);
  const reminders = [makeReminder({ currentStreak: 6, longestStreak: 6, lastCompletedDate: fourDaysAgo })];
  const result = checkStaleStreaks(reminders, today);
  assert.equal(result[0].currentStreak, 0);
  assert.equal(result[0].longestStreak, 6);
});

test('checkStaleStreaks preserves a streak still within the grace period', () => {
  const twoDaysAgo = dateKey(base, -2);
  const today = dateKey(base, 0);
  const reminders = [makeReminder({ currentStreak: 3, longestStreak: 3, lastCompletedDate: twoDaysAgo })];
  const result = checkStaleStreaks(reminders, today);
  assert.equal(result[0].currentStreak, 3);
});

test('isOnGrace is false the day after completion (not yet at risk)', () => {
  const yesterday = dateKey(base, -1);
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 3, longestStreak: 3, lastCompletedDate: yesterday });
  assert.equal(isOnGrace(reminder, today), false);
});

test('isOnGrace is true after missing exactly one occurrence (last chance today)', () => {
  const twoDaysAgo = dateKey(base, -2);
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 3, longestStreak: 3, lastCompletedDate: twoDaysAgo });
  assert.equal(isOnGrace(reminder, today), true);
});

test('isOnGrace is false once the streak has already broken', () => {
  const fourDaysAgo = dateKey(base, -4);
  const today = dateKey(base, 0);
  const reminder = makeReminder({ currentStreak: 3, longestStreak: 3, lastCompletedDate: fourDaysAgo });
  assert.equal(isOnGrace(reminder, today), false);
});

test('getPreviousScheduledDate for daysOfWeek walks back to the nearest matching weekday', () => {
  // 2024-01-10 is a Wednesday; daysOfWeek [1,3,5] = Mon/Wed/Fri.
  const wednesday = dateKey(base, 0);
  const reminder = makeReminder({ recurrence: { type: 'daysOfWeek', daysOfWeek: [1, 3, 5] } });
  assert.equal(getPreviousScheduledDate(reminder, wednesday), dateKey(base, -2)); // previous Monday
});

test('daysOfWeek streak survives the grace period across a missed occurrence', () => {
  // Mon/Wed/Fri schedule. Completed Monday, then completes the following Friday
  // (missed Wednesday) — one missed occurrence, should still extend the streak.
  const monday = dateKey(base, -2);
  const friday = dateKey(base, 2);
  const reminder = makeReminder({
    currentStreak: 4,
    longestStreak: 4,
    lastCompletedDate: monday,
    recurrence: { type: 'daysOfWeek', daysOfWeek: [1, 3, 5] },
  });
  const result = markReminderTaken(reminder, friday);
  assert.equal(result.currentStreak, 5);
});

test('daysOfWeek streak resets after missing two occurrences', () => {
  const prevFriday = dateKey(base, -5);
  const friday = dateKey(base, 2);
  const reminder = makeReminder({
    currentStreak: 6,
    longestStreak: 6,
    lastCompletedDate: prevFriday,
    recurrence: { type: 'daysOfWeek', daysOfWeek: [1, 3, 5] },
  });
  const result = markReminderTaken(reminder, friday);
  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 6);
});

test('monthlyDate streak continues from the previous month', () => {
  const lastMonth = todayKey(new Date(2023, 11, 1)); // 2023-12-01
  const thisMonth = todayKey(new Date(2024, 0, 1)); // 2024-01-01
  const reminder = makeReminder({
    currentStreak: 2,
    longestStreak: 2,
    lastCompletedDate: lastMonth,
    recurrence: { type: 'monthlyDate', dayOfMonth: 1 },
  });
  const result = markReminderTaken(reminder, thisMonth);
  assert.equal(result.currentStreak, 3);
});

test('monthlyDate on the 31st clamps to the previous month\'s last day', () => {
  const reminder = makeReminder({ recurrence: { type: 'monthlyDate', dayOfMonth: 31 } });
  // 2024 is a leap year, so February has 29 days.
  assert.equal(getPreviousScheduledDate(reminder, '2024-03-31'), '2024-02-29');
});

test('once reminders always report a streak of 1 with no ongoing schedule', () => {
  const reminder = makeReminder({ recurrence: { type: 'once', date: '2024-01-15' } });
  const result = markReminderTaken(reminder, '2024-01-15');
  assert.equal(result.currentStreak, 1);
  assert.equal(getPreviousScheduledDate(reminder, '2024-01-15'), null);
});

test('checkStaleStreaks never resets a completed once reminder', () => {
  const reminder = makeReminder({
    currentStreak: 1,
    longestStreak: 1,
    lastCompletedDate: '2020-01-01',
    recurrence: { type: 'once', date: '2020-01-01' },
  });
  const result = checkStaleStreaks([reminder], dateKey(base, 0));
  assert.equal(result[0].currentStreak, 1);
});
