import test from 'node:test';
import assert from 'node:assert/strict';
import { markReminderTaken, checkStaleStreaks, todayKey } from './streak.js';

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
