import test from 'node:test';
import assert from 'node:assert/strict';
import { appliesToday, isPendingToday, isOverdue, getPendingToday, countOverdue } from './due.js';
import { todayKey } from './streak.js';

// 2024-01-10 is a Wednesday.
function at(hour, minute = 0) {
  return new Date(2024, 0, 10, hour, minute);
}

function makeReminder(overrides = {}) {
  return { id: 1, name: 'Test', time: '09:00', takenDate: null, recurrence: { type: 'daily' }, ...overrides };
}

test('daily reminders apply every day', () => {
  assert.equal(appliesToday(makeReminder(), at(8)), true);
});

test('reminders with no recurrence field are treated as daily', () => {
  assert.equal(appliesToday(makeReminder({ recurrence: undefined }), at(8)), true);
});

test('daysOfWeek applies only on listed weekdays', () => {
  const monWedFri = makeReminder({ recurrence: { type: 'daysOfWeek', daysOfWeek: [1, 3, 5] } });
  const tuesThurs = makeReminder({ recurrence: { type: 'daysOfWeek', daysOfWeek: [2, 4] } });
  assert.equal(appliesToday(monWedFri, at(8)), true);
  assert.equal(appliesToday(tuesThurs, at(8)), false);
});

test('monthlyDate applies only on that day of the month', () => {
  assert.equal(appliesToday(makeReminder({ recurrence: { type: 'monthlyDate', dayOfMonth: 10 } }), at(8)), true);
  assert.equal(appliesToday(makeReminder({ recurrence: { type: 'monthlyDate', dayOfMonth: 11 } }), at(8)), false);
});

test('once applies only on its date', () => {
  assert.equal(appliesToday(makeReminder({ recurrence: { type: 'once', date: '2024-01-10' } }), at(8)), true);
  assert.equal(appliesToday(makeReminder({ recurrence: { type: 'once', date: '2024-01-11' } }), at(8)), false);
});

test('a reminder already taken today is not pending', () => {
  const taken = makeReminder({ takenDate: todayKey(at(8)) });
  assert.equal(isPendingToday(taken, at(8)), false);
});

test('a reminder taken on a previous day is still pending today', () => {
  assert.equal(isPendingToday(makeReminder({ takenDate: '2024-01-09' }), at(8)), true);
});

test('isOverdue is false before the scheduled time', () => {
  assert.equal(isOverdue(makeReminder({ time: '09:00' }), at(8, 59)), false);
});

test('isOverdue is true at and after the scheduled time', () => {
  assert.equal(isOverdue(makeReminder({ time: '09:00' }), at(9, 0)), true);
  assert.equal(isOverdue(makeReminder({ time: '09:00' }), at(15, 30)), true);
});

test('isOverdue is false once taken, even long after the scheduled time', () => {
  const taken = makeReminder({ time: '09:00', takenDate: todayKey(at(15)) });
  assert.equal(isOverdue(taken, at(15)), false);
});

test('isOverdue is false for reminders that do not apply today', () => {
  const tuesThurs = makeReminder({ time: '09:00', recurrence: { type: 'daysOfWeek', daysOfWeek: [2, 4] } });
  assert.equal(isOverdue(tuesThurs, at(15)), false);
});

test('getPendingToday returns applicable untaken reminders, soonest first', () => {
  const reminders = [
    makeReminder({ id: 1, time: '20:00' }),
    makeReminder({ id: 2, time: '08:00' }),
    makeReminder({ id: 3, time: '12:00', takenDate: todayKey(at(10)) }),
    makeReminder({ id: 4, time: '07:00', recurrence: { type: 'daysOfWeek', daysOfWeek: [2] } }),
  ];
  assert.deepEqual(getPendingToday(reminders, at(10)).map(r => r.id), [2, 1]);
});

test('countOverdue counts only pending reminders whose time has passed', () => {
  const reminders = [
    makeReminder({ id: 1, time: '08:00' }),
    makeReminder({ id: 2, time: '09:30' }),
    makeReminder({ id: 3, time: '20:00' }),
    makeReminder({ id: 4, time: '07:00', takenDate: todayKey(at(10)) }),
  ];
  assert.equal(countOverdue(reminders, at(10)), 2);
  assert.equal(countOverdue([], at(10)), 0);
});
