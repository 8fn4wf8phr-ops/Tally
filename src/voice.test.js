import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceInput } from './voice.js';

test('explicit am time + "remind me to" prefix', () => {
  const result = parseVoiceInput('Remind me to take vitamins at 8am');
  assert.deepEqual(result, {
    name: 'Take vitamins',
    time: { hour: 8, minute: 0, matchedText: '8am' },
    recurrence: { type: 'once', matchedText: [] },
  });
});

test('explicit pm time rolls into 24h + literal "every day"', () => {
  const result = parseVoiceInput('Take medication every day at 9pm');
  assert.deepEqual(result, {
    name: 'Take medication',
    time: { hour: 21, minute: 0, matchedText: '9pm' },
    recurrence: { type: 'daily', matchedText: ['every day'] },
  });
});

test('"every <period>" implies daily with a vague default hour', () => {
  const result = parseVoiceInput('Stretch every morning');
  assert.deepEqual(result, {
    name: 'Stretch',
    time: { hour: 8, minute: 0, vague: true },
    recurrence: { type: 'daily', matchedText: ['every morning'] },
  });
});

test('"in the <period>" is vague but does not imply daily', () => {
  const result = parseVoiceInput('Take a break in the afternoon');
  assert.deepEqual(result, {
    name: 'Take a break',
    time: { hour: 14, minute: 0, vague: true },
    recurrence: { type: 'once', matchedText: [] },
  });
});

test('multiple weekday names produce daysOfWeek recurrence', () => {
  const result = parseVoiceInput('Call mom on Sunday and Wednesday');
  assert.deepEqual(result, {
    name: 'Call mom',
    time: null,
    recurrence: { type: 'daysOfWeek', daysOfWeek: [0, 3], matchedText: ['sunday', 'wednesday'] },
  });
});

test('"on the Nth" produces monthlyDate recurrence', () => {
  const result = parseVoiceInput('Pay rent on the 1st');
  assert.deepEqual(result, {
    name: 'Pay rent',
    time: null,
    recurrence: { type: 'monthlyDate', dayOfMonth: 1, matchedText: ['on the 1st'] },
  });
});

test('"noon" keyword resolves to 12:00', () => {
  const result = parseVoiceInput('Meeting at noon');
  assert.deepEqual(result, {
    name: 'Meeting',
    time: { hour: 12, minute: 0, matchedText: 'noon' },
    recurrence: { type: 'once', matchedText: [] },
  });
});

test('"midnight" keyword resolves to 0:00', () => {
  const result = parseVoiceInput('Lights out at midnight');
  assert.deepEqual(result, {
    name: 'Lights out',
    time: { hour: 0, minute: 0, matchedText: 'midnight' },
    recurrence: { type: 'once', matchedText: [] },
  });
});

test('"remember to" prefix + minutes + literal "daily" keyword', () => {
  const result = parseVoiceInput('Remember to walk the dog daily at 6:30am');
  assert.deepEqual(result, {
    name: 'Walk the dog',
    time: { hour: 6, minute: 30, matchedText: '6:30am' },
    recurrence: { type: 'daily', matchedText: ['daily'] },
  });
});

test('no recurrence phrase defaults to "once", never guesses daily', () => {
  const result = parseVoiceInput('Water the plants');
  assert.equal(result.recurrence.type, 'once');
});

// Known/accepted limitation (see voice.js): a dangling connector word left
// after stripping matched phrases gets removed globally, which can eat a
// word that was actually part of the task name.
test('accepted limitation: dangling "on" gets stripped from the name', () => {
  const result = parseVoiceInput('check on the invoice');
  assert.deepEqual(result, {
    name: 'Check the invoice',
    time: null,
    recurrence: { type: 'once', matchedText: [] },
  });
});
