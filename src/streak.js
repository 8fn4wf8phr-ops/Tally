// Pure streak-tracking logic, kept free of DOM/Capacitor so it can be
// imported directly in tests.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / MS_PER_DAY);
}

export function markReminderTaken(reminder, today = todayKey()) {
  if (reminder.lastCompletedDate === today) {
    return reminder;
  }

  const gap = reminder.lastCompletedDate ? daysBetween(reminder.lastCompletedDate, today) : null;
  const updated = { ...reminder };

  // A gap of 1-2 days is the grace period: missing exactly one day doesn't break the streak.
  updated.currentStreak = gap !== null && gap >= 1 && gap <= 2 ? reminder.currentStreak + 1 : 1;
  updated.lastCompletedDate = today;

  if (updated.currentStreak > updated.longestStreak) {
    updated.longestStreak = updated.currentStreak;
  }

  return updated;
}

export function isOnGrace(reminder, today = todayKey()) {
  if (!reminder.currentStreak || !reminder.lastCompletedDate || reminder.lastCompletedDate === today) {
    return false;
  }
  return daysBetween(reminder.lastCompletedDate, today) === 1;
}

export function checkStaleStreaks(reminders, today = todayKey()) {
  return reminders.map(reminder => {
    if (reminder.lastCompletedDate && daysBetween(reminder.lastCompletedDate, today) >= 3) {
      return { ...reminder, currentStreak: 0 };
    }
    return reminder;
  });
}
