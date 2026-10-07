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

// ---- Home tabs: Today / Upcoming / Done ----
export const VIEWS = ['today', 'upcoming', 'done'];

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

// The next calendar day (strictly after today) this reminder applies, or
// null if it never will again (a one-time reminder that's today or earlier).
export function nextOccurrence(reminder, date = new Date()) {
  const recurrence = reminder.recurrence || { type: 'daily' };
  if (recurrence.type === 'once') {
    const [y, m, d] = recurrence.date.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    return day > startOfDay(date) ? day : null;
  }
  // A year of lookahead covers every pattern, including "the 31st" and "the 29th".
  for (let i = 1; i <= 366; i++) {
    const candidate = addDays(date, i);
    if (appliesToday(reminder, candidate)) return candidate;
  }
  return null;
}

// Upcoming = doesn't apply today, but will again.
export function isUpcoming(reminder, date = new Date()) {
  return !appliesToday(reminder, date) && nextOccurrence(reminder, date) !== null;
}

export function isDoneToday(reminder, date = new Date()) {
  return appliesToday(reminder, date) && reminder.takenDate === todayKey(date);
}

// Reminders for one Home tab. Today = still pending, Done = completed today,
// Upcoming = not due today, soonest day first.
export function filterForView(reminders, view, date = new Date()) {
  if (view === 'upcoming') {
    return reminders
      .filter(r => isUpcoming(r, date))
      .sort((a, b) => (nextOccurrence(a, date) - nextOccurrence(b, date)) || a.time.localeCompare(b.time));
  }
  const matches = view === 'done' ? isDoneToday : isPendingToday;
  return reminders.filter(r => matches(r, date)).sort((a, b) => a.time.localeCompare(b.time));
}

// "Today" / "Tomorrow" / "Fri, Jan 12".
export function describeDay(day, today = new Date(), locale) {
  const diff = Math.round((startOfDay(day) - startOfDay(today)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return day.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

// True only when there was at least one reminder relevant to today and every
// one of them has been taken — an empty list, or a list where nothing
// applies today, is not "all done", it's just nothing to do.
export function isAllDoneToday(reminders, date = new Date()) {
  const relevantToday = reminders.filter(r => appliesToday(r, date));
  if (relevantToday.length === 0) return false;
  const todayStr = todayKey(date);
  return relevantToday.every(r => r.takenDate === todayStr);
}
