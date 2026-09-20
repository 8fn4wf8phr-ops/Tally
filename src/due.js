// Pure "what's due today" logic, kept free of DOM/Capacitor so it can be
// imported directly in tests (same pattern as streak.js).
//
// "Pending" = scheduled for today and not yet marked taken today.
// "Overdue" = pending, and its scheduled time has already passed.

import { todayKey } from './streak.js';

export function appliesToday(reminder, date = new Date()) {
  const recurrence = reminder.recurrence || { type: 'daily' };
  if (recurrence.type === 'daysOfWeek') {
    return (recurrence.daysOfWeek || []).includes(date.getDay());
  }
  if (recurrence.type === 'monthlyDate') {
    return recurrence.dayOfMonth === date.getDate();
  }
  if (recurrence.type === 'once') {
    return recurrence.date === todayKey(date);
  }
  return true;
}

// A one-time reminder whose date and time have already passed has nothing
// left to schedule.
export function isExpiredOneTime(reminder, date = new Date()) {
  const recurrence = reminder.recurrence;
  if (!recurrence || recurrence.type !== 'once') return false;
  const [y, m, d] = recurrence.date.split('-').map(Number);
  const [h, min] = reminder.time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min) <= date;
}

export function isPendingToday(reminder, date = new Date()) {
  return appliesToday(reminder, date) && reminder.takenDate !== todayKey(date);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isOverdue(reminder, date = new Date()) {
  if (!isPendingToday(reminder, date)) return false;
  return toMinutes(reminder.time) <= date.getHours() * 60 + date.getMinutes();
}

// Soonest first, so "the next one up" is always element 0.
export function getPendingToday(reminders, date = new Date()) {
  return reminders
    .filter(r => isPendingToday(r, date))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function countOverdue(reminders, date = new Date()) {
  return reminders.filter(r => isOverdue(r, date)).length;
}
