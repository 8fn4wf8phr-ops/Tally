import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTimeOfDay,
  getGreeting,
  getDueReminderPhrase,
  getDueCountMessage,
  getContextualGreeting,
  isStreakAcknowledgment,
  getStreakAcknowledgment,
  getEmptyStateMessage,
  isStreakMilestone,
  getMilestoneMessage,
  getStreakResetMessage,
  getNotificationBody,
} from './personalization.js';

function atHour(hour) {
  return new Date(2024, 0, 10, hour, 0, 0);
}

test('getTimeOfDay buckets hours into morning/afternoon/evening', () => {
  assert.equal(getTimeOfDay(atHour(5)), 'morning');
  assert.equal(getTimeOfDay(atHour(11)), 'morning');
  assert.equal(getTimeOfDay(atHour(12)), 'afternoon');
  assert.equal(getTimeOfDay(atHour(16)), 'afternoon');
  assert.equal(getTimeOfDay(atHour(17)), 'evening');
  assert.equal(getTimeOfDay(atHour(23)), 'evening');
  assert.equal(getTimeOfDay(atHour(0)), 'evening');
  assert.equal(getTimeOfDay(atHour(4)), 'evening');
});

test('getGreeting includes the name when set', () => {
  assert.equal(getGreeting('Sam', atHour(8)), 'Good morning, Sam');
  assert.equal(getGreeting('Sam', atHour(14)), 'Good afternoon, Sam');
  assert.equal(getGreeting('Sam', atHour(20)), 'Good evening, Sam');
});

test('getGreeting falls back to generic phrasing with no name', () => {
  assert.equal(getGreeting(null, atHour(8)), 'Good morning');
  assert.equal(getGreeting(undefined, atHour(14)), 'Good afternoon');
  assert.equal(getGreeting('', atHour(20)), 'Good evening');
});

test('getEmptyStateMessage personalizes and stays time-of-day aware', () => {
  const msg = getEmptyStateMessage('Sam', atHour(8), 0);
  assert.match(msg, /Sam/);
});

test('getEmptyStateMessage falls back to generic phrasing with no name', () => {
  const msg = getEmptyStateMessage(null, atHour(8), 0);
  assert.doesNotMatch(msg, /\{name\}/);
  assert.doesNotMatch(msg, /undefined|null/);
});

test('getEmptyStateMessage varies with the random value passed in', () => {
  const first = getEmptyStateMessage('Sam', atHour(8), 0);
  const second = getEmptyStateMessage('Sam', atHour(8), 0.99);
  assert.notEqual(first, second);
});

test('isStreakMilestone is true only for 7/30/100/365', () => {
  assert.equal(isStreakMilestone(7), true);
  assert.equal(isStreakMilestone(30), true);
  assert.equal(isStreakMilestone(100), true);
  assert.equal(isStreakMilestone(365), true);
  assert.equal(isStreakMilestone(8), false);
  assert.equal(isStreakMilestone(0), false);
});

test('getMilestoneMessage personalizes named milestones', () => {
  assert.equal(getMilestoneMessage(7, 'Sam'), 'One week strong, Sam 🔥');
  assert.equal(getMilestoneMessage(30, 'Sam'), 'One month strong, Sam 🔥');
  assert.equal(getMilestoneMessage(100, 'Sam'), '100 days strong, Sam 🔥');
  assert.equal(getMilestoneMessage(365, 'Sam'), 'One year strong, Sam 🔥');
});

test('getMilestoneMessage falls back to generic phrasing with no name', () => {
  assert.equal(getMilestoneMessage(7, null), 'One week strong 🔥');
});

test('getMilestoneMessage returns null for a non-milestone streak', () => {
  assert.equal(getMilestoneMessage(8, 'Sam'), null);
});

test('getDueReminderPhrase uses all four named phrasings and always includes title and name', () => {
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const phrase = getDueReminderPhrase('Vitamins', 'Sam', i / 4);
    assert.match(phrase, /Vitamins/);
    assert.match(phrase, /Sam/);
    seen.add(phrase);
  }
  assert.equal(seen.size, 4);
});

test('getDueReminderPhrase falls back to name-free phrasings with no name', () => {
  for (let i = 0; i < 4; i++) {
    const phrase = getDueReminderPhrase('Vitamins', null, i / 4);
    assert.match(phrase, /Vitamins/);
    assert.doesNotMatch(phrase, /\{|undefined|null|, \./);
  }
});

test('getDueCountMessage reads naturally with and without a name', () => {
  assert.equal(getDueCountMessage(3, 'Sam'), '3 left on your list today, Sam.');
  assert.equal(getDueCountMessage(3, null), '3 left on your list today.');
});

test('getContextualGreeting stays a plain greeting in simple mode', () => {
  const greeting = getContextualGreeting({ style: 'simple', pendingTitles: ['Vitamins'], name: 'Sam', date: atHour(8) });
  assert.equal(greeting, 'Good morning, Sam');
});

test('getContextualGreeting stays a plain greeting in detailed mode with nothing pending', () => {
  const greeting = getContextualGreeting({ style: 'detailed', pendingTitles: [], name: null, date: atHour(14) });
  assert.equal(greeting, 'Good afternoon');
});

test('getContextualGreeting rotates a phrase for exactly one pending reminder in detailed mode', () => {
  const first = getContextualGreeting({ style: 'detailed', pendingTitles: ['Vitamins'], name: 'Sam', random: 0 });
  const other = getContextualGreeting({ style: 'detailed', pendingTitles: ['Vitamins'], name: 'Sam', random: 0.99 });
  assert.match(first, /Vitamins/);
  assert.notEqual(first, other);
});

test('getContextualGreeting falls back to the count message for several pending reminders', () => {
  const greeting = getContextualGreeting({ style: 'detailed', pendingTitles: ['A', 'B'], name: 'Sam' });
  assert.equal(greeting, '2 left on your list today, Sam.');
});

test('isStreakAcknowledgment is true only for 3 and 5', () => {
  assert.equal(isStreakAcknowledgment(3), true);
  assert.equal(isStreakAcknowledgment(5), true);
  for (const n of [0, 1, 2, 4, 6, 7]) assert.equal(isStreakAcknowledgment(n), false);
});

test('getStreakAcknowledgment personalizes 3- and 5-day streaks', () => {
  assert.equal(getStreakAcknowledgment(3, 'Sam'), 'Three in a row, Sam.');
  assert.equal(getStreakAcknowledgment(5, 'Sam'), 'Five days, Sam — building a habit.');
});

test('getStreakAcknowledgment falls back to name-free copy', () => {
  assert.equal(getStreakAcknowledgment(3, null), 'Three in a row.');
  assert.equal(getStreakAcknowledgment(5, null), 'Five days — building a habit.');
});

test('getStreakAcknowledgment returns null for other streaks', () => {
  assert.equal(getStreakAcknowledgment(4, 'Sam'), null);
});

test('every empty-state period has three distinct named and generic variants', () => {
  for (const hour of [8, 14, 20]) {
    const named = new Set([0, 0.34, 0.67].map(r => getEmptyStateMessage('Sam', atHour(hour), r)));
    const generic = new Set([0, 0.34, 0.67].map(r => getEmptyStateMessage(null, atHour(hour), r)));
    assert.equal(named.size, 3);
    assert.equal(generic.size, 3);
  }
});

test('getStreakResetMessage personalizes when a name is set', () => {
  const variantCount = 3;
  for (let i = 0; i < variantCount; i++) {
    const msg = getStreakResetMessage('Sam', i / variantCount);
    assert.match(msg, /Sam/);
  }
});

test('getStreakResetMessage falls back to generic phrasing with no name', () => {
  const variantCount = 3;
  for (let i = 0; i < variantCount; i++) {
    const msg = getStreakResetMessage(null, i / variantCount);
    assert.doesNotMatch(msg, /\{name\}/);
    assert.doesNotMatch(msg, /undefined|null/);
  }
});

test('getStreakResetMessage varies with the random value passed in', () => {
  const first = getStreakResetMessage('Sam', 0);
  const second = getStreakResetMessage('Sam', 0.99);
  assert.notEqual(first, second);
});

test('getNotificationBody fills in name and title across all named variants', () => {
  const variantCount = 4;
  for (let i = 0; i < variantCount; i++) {
    const body = getNotificationBody('Vitamins', 'Sam', i / variantCount);
    assert.match(body, /Sam/);
    assert.match(body, /Vitamins/);
  }
});

test('getNotificationBody falls back to name-free variants with no name', () => {
  const variantCount = 4;
  for (let i = 0; i < variantCount; i++) {
    const body = getNotificationBody('Vitamins', null, i / variantCount);
    assert.doesNotMatch(body, /undefined|null/);
    assert.match(body, /Vitamins/);
  }
});
