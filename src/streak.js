// Pure streak-tracking logic, kept free of DOM/Capacitor so it can be
// imported directly in tests.
//
// Streaks only apply to 'daily' and 'daysOfWeek' reminders. 'monthlyDate'
// and 'once' reminders never touch currentStreak/longestStreak/lastCompletedDate.

const STREAK_ELIGIBLE_TYPES = new Set(['daily', 'daysOfWeek']);

export function isStreakEligible(reminder) {
  const type = (reminder.recurrence || { type: 'daily' }).type;
  return STREAK_ELIGIBLE_TYPES.has(type);
}

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

// The expected previous scheduled occurrence before `fromKey`, for 'daily'
// and 'daysOfWeek' reminders only (the only types that use this).
export function getPreviousScheduledDate(reminder, fromKey) {
  const recurrence = reminder.recurrence || { type: 'daily' };

  if (recurrence.type === 'daysOfWeek') {
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

  // 'daily' (default/fallback spacing).
  return subtractDays(fromKey, 1);
}

export function markReminderTaken(reminder, today = todayKey()) {
  // monthlyDate and once reminders don't track streaks at all — completion
  // itself is already recorded elsewhere (takenDate), so just no-op here.
  if (!isStreakEligible(reminder)) {
    return reminder;
  }

  // Backdated/out-of-order completion (lastCompletedDate is after today), or
  // an already-recorded same-day tap — leave the streak untouched either way.
  if (reminder.lastCompletedDate !== null && today <= reminder.lastCompletedDate) {
    return reminder;
  }

  const prev1 = getPreviousScheduledDate(reminder, today);
  const prev2 = prev1 !== null ? getPreviousScheduledDate(reminder, prev1) : null;
  // Grace period: landing on either of the two most recent expected
  // occurrences means at most one occurrence was missed.
  const withinGrace = reminder.lastCompletedDate === prev1 || reminder.lastCompletedDate === prev2;

  const updated = { ...reminder };
  updated.currentStreak = withinGrace ? reminder.currentStreak + 1 : 1;
  updated.lastCompletedDate = today;

  if (updated.currentStreak > updated.longestStreak) {
    updated.longestStreak = updated.currentStreak;
  }

  return updated;
}

export function isOnGrace(reminder, today = todayKey()) {
  if (!isStreakEligible(reminder)) return false;
  if (!reminder.currentStreak || !reminder.lastCompletedDate || reminder.lastCompletedDate === today) {
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
    if (!isStreakEligible(reminder)) return reminder;
    if (!reminder.lastCompletedDate || reminder.lastCompletedDate === today) return reminder;

    const prev1 = getPreviousScheduledDate(reminder, today);
    if (prev1 === null) return reminder;
    const prev2 = getPreviousScheduledDate(reminder, prev1);

    const withinGrace = reminder.lastCompletedDate === prev1 || reminder.lastCompletedDate === prev2;
    if (!withinGrace) {
      return { ...reminder, currentStreak: 0 };
    }
    return reminder;
  });
}
