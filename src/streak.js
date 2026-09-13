// Pure streak-tracking logic, kept free of DOM/Capacitor so it can be
// imported directly in tests.

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function subtractDays(dateKey, n) {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() - n);
  return todayKey(d);
}

// The scheduled occurrence immediately before `fromKey`, per the reminder's
// recurrence rule. Returns null when there is no such occurrence (a 'once'
// reminder, or a malformed recurrence).
export function getPreviousScheduledDate(reminder, fromKey) {
  const recurrence = reminder.recurrence || { type: 'daily' };

  switch (recurrence.type) {
    case 'daysOfWeek': {
      const days = recurrence.daysOfWeek;
      if (!days || days.length === 0) return null;
      let d = subtractDays(fromKey, 1);
      // Bounded walk so a malformed/empty schedule can't loop forever.
      for (let i = 0; i < 14; i++) {
        if (days.includes(parseDateKey(d).getDay())) return d;
        d = subtractDays(d, 1);
      }
      return null;
    }

    case 'monthlyDate': {
      const from = parseDateKey(fromKey);
      // Day 1 never overflows a month, so compute the previous month safely first,
      // then clamp the target day to however many days that month actually has
      // (e.g. dayOfMonth 31 in February shouldn't roll over into March).
      const prevMonthFirst = new Date(from.getFullYear(), from.getMonth() - 1, 1);
      const daysInPrevMonth = new Date(prevMonthFirst.getFullYear(), prevMonthFirst.getMonth() + 1, 0).getDate();
      const day = Math.min(recurrence.dayOfMonth, daysInPrevMonth);
      return todayKey(new Date(prevMonthFirst.getFullYear(), prevMonthFirst.getMonth(), day));
    }

    case 'once':
      return null;

    case 'daily':
    default:
      return subtractDays(fromKey, 1);
  }
}

export function markReminderTaken(reminder, today = todayKey()) {
  // Same-day taps shouldn't double-count, and a "today" that's somehow
  // earlier than the last recorded completion (clock changed backward,
  // crossing the date line) shouldn't overwrite more recent progress.
  if (reminder.lastCompletedDate !== null && today <= reminder.lastCompletedDate) {
    return reminder;
  }

  const updated = { ...reminder };
  const recurrence = reminder.recurrence || { type: 'daily' };

  if (recurrence.type === 'once') {
    // No recurring schedule, so there's nothing to be consecutive with.
    updated.currentStreak = 1;
  } else {
    const prev1 = getPreviousScheduledDate(reminder, today);
    const prev2 = prev1 !== null ? getPreviousScheduledDate(reminder, prev1) : null;
    // Grace period: completing on or after the second-most-recent scheduled
    // occurrence means at most one occurrence was missed.
    const withinGrace = reminder.lastCompletedDate !== null && prev2 !== null && reminder.lastCompletedDate >= prev2;
    updated.currentStreak = withinGrace ? reminder.currentStreak + 1 : 1;
  }

  updated.lastCompletedDate = today;
  if (updated.currentStreak > updated.longestStreak) {
    updated.longestStreak = updated.currentStreak;
  }

  return updated;
}

export function isOnGrace(reminder, today = todayKey()) {
  const recurrence = reminder.recurrence || { type: 'daily' };
  if (!reminder.currentStreak || !reminder.lastCompletedDate || reminder.lastCompletedDate === today || recurrence.type === 'once') {
    return false;
  }
  const prev1 = getPreviousScheduledDate(reminder, today);
  if (prev1 === null) return false;
  const prev2 = getPreviousScheduledDate(reminder, prev1);
  // On grace: the most recent scheduled occurrence was missed, but the one
  // before it wasn't — today is the last chance before the streak breaks.
  return reminder.lastCompletedDate !== prev1 && reminder.lastCompletedDate === prev2;
}

export function checkStaleStreaks(reminders, today = todayKey()) {
  return reminders.map(reminder => {
    const recurrence = reminder.recurrence || { type: 'daily' };
    if (!reminder.lastCompletedDate || recurrence.type === 'once') return reminder;

    const prev1 = getPreviousScheduledDate(reminder, today);
    if (prev1 === null) return reminder;
    const prev2 = getPreviousScheduledDate(reminder, prev1);
    if (prev2 === null) return reminder;

    if (reminder.lastCompletedDate < prev2) {
      return { ...reminder, currentStreak: 0 };
    }
    return reminder;
  });
}
