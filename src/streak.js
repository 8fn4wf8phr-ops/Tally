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

// The set of scheduled occurrences before `fromKey` that still count as
// "within grace" — `graceOccurrences` of them may be missed entirely.
// graceOccurrences=1 (the long-standing default) walks back two occurrences:
// the most recent one (on-time) and the one before it (one miss forgiven).
function getGraceWindow(reminder, fromKey, graceOccurrences) {
  const dates = [];
  let cursor = fromKey;
  for (let i = 0; i <= graceOccurrences; i++) {
    cursor = getPreviousScheduledDate(reminder, cursor);
    if (cursor === null) break;
    dates.push(cursor);
  }
  return dates;
}

export function markReminderTaken(reminder, today = todayKey(), graceOccurrences = 1) {
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

  const withinGrace = getGraceWindow(reminder, today, graceOccurrences).includes(reminder.lastCompletedDate);

  const updated = { ...reminder };
  updated.currentStreak = withinGrace ? reminder.currentStreak + 1 : 1;
  updated.lastCompletedDate = today;

  if (updated.currentStreak > updated.longestStreak) {
    updated.longestStreak = updated.currentStreak;
  }

  return updated;
}

export function isOnGrace(reminder, today = todayKey(), graceOccurrences = 1) {
  if (!isStreakEligible(reminder)) return false;
  if (!reminder.currentStreak || !reminder.lastCompletedDate || reminder.lastCompletedDate === today) {
    return false;
  }
  const window = getGraceWindow(reminder, today, graceOccurrences);
  if (window.length === 0) return false;
  // On grace: at least one occurrence was missed (not the most recent/on-time
  // one), but the streak hasn't broken yet — today is the last chance.
  return reminder.lastCompletedDate !== window[0] && window.includes(reminder.lastCompletedDate);
}

export function checkStaleStreaks(reminders, today = todayKey(), graceOccurrences = 1) {
  return reminders.map(reminder => {
    if (!isStreakEligible(reminder)) return reminder;
    if (!reminder.lastCompletedDate || reminder.lastCompletedDate === today) return reminder;

    const withinGrace = getGraceWindow(reminder, today, graceOccurrences).includes(reminder.lastCompletedDate);
    if (!withinGrace) {
      return { ...reminder, currentStreak: 0 };
    }
    return reminder;
  });
}
