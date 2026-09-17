import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTimeOfDay,
  getGreeting,
  getEmptyStateMessage,
  isStreakMilestone,
  getMilestoneMessage,
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
