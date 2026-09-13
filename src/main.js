import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { markReminderTaken, checkStaleStreaks, isOnGrace, todayKey } from './streak.js';
import './style.css';

const STORAGE_KEY = 'tally-reminders';
const NEXT_ID_KEY = 'tally-next-id';

let reminders = [];
let nextId = 1;
let editingId = null;

const listEl = document.getElementById('reminderList');
const emptyStateEl = document.getElementById('emptyState');
const addForm = document.getElementById('addForm');
const nameInput = document.getElementById('nameInput');
const timeInput = document.getElementById('timeInput');
const recurrenceFieldsEl = document.getElementById('recurrenceFields');
const permissionBanner = document.getElementById('permissionBanner');
const enableNotifsBtn = document.getElementById('enableNotifsBtn');

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- Recurrence UI helpers ----
function renderRecurrenceFields(recurrence = { type: 'daily' }) {
  const selectedDays = recurrence.daysOfWeek || [];
  const weekdayButtons = WEEKDAY_LABELS.map((label, i) => `
    <button type="button" class="weekday-btn${selectedDays.includes(i) ? ' selected' : ''}" data-day="${i}" aria-label="${WEEKDAY_NAMES[i]}">${label}</button>
  `).join('');

  return `
    <select class="recurrence-select">
      <option value="daily"${recurrence.type === 'daily' ? ' selected' : ''}>Every day</option>
      <option value="daysOfWeek"${recurrence.type === 'daysOfWeek' ? ' selected' : ''}>Specific days</option>
      <option value="monthlyDate"${recurrence.type === 'monthlyDate' ? ' selected' : ''}>Monthly</option>
      <option value="once"${recurrence.type === 'once' ? ' selected' : ''}>One time</option>
    </select>
    <div class="weekdays-picker"${recurrence.type === 'daysOfWeek' ? '' : ' hidden'}>${weekdayButtons}</div>
    <input type="number" class="day-of-month-input" min="1" max="31" placeholder="Day of month (1-31)" value="${recurrence.type === 'monthlyDate' ? recurrence.dayOfMonth : ''}"${recurrence.type === 'monthlyDate' ? '' : ' hidden'}>
    <input type="date" class="once-date-input" value="${recurrence.type === 'once' ? recurrence.date : ''}"${recurrence.type === 'once' ? '' : ' hidden'}>
  `;
}

function wireRecurrenceControls(root) {
  const select = root.querySelector('.recurrence-select');
  const weekdaysPicker = root.querySelector('.weekdays-picker');
  const dayOfMonthInput = root.querySelector('.day-of-month-input');
  const onceDateInput = root.querySelector('.once-date-input');

  select.addEventListener('change', () => {
    weekdaysPicker.hidden = select.value !== 'daysOfWeek';
    dayOfMonthInput.hidden = select.value !== 'monthlyDate';
    onceDateInput.hidden = select.value !== 'once';
  });

  root.querySelectorAll('.weekday-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
  });
}

// Returns a recurrence object read from the form, or null if the current
// selection is incomplete (e.g. no weekday picked yet).
function readRecurrenceFromForm(root) {
  const type = root.querySelector('.recurrence-select').value;

  if (type === 'daysOfWeek') {
    const daysOfWeek = [...root.querySelectorAll('.weekday-btn.selected')].map(b => Number(b.dataset.day));
    return daysOfWeek.length > 0 ? { type, daysOfWeek } : null;
  }
  if (type === 'monthlyDate') {
    const dayOfMonth = Number(root.querySelector('.day-of-month-input').value);
    return Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31 ? { type, dayOfMonth } : null;
  }
  if (type === 'once') {
    const date = root.querySelector('.once-date-input').value;
    return date ? { type, date } : null;
  }
  return { type: 'daily' };
}

function ordinal(n) {
  if (n % 10 === 1 && n !== 11) return `${n}st`;
  if (n % 10 === 2 && n !== 12) return `${n}nd`;
  if (n % 10 === 3 && n !== 13) return `${n}rd`;
  return `${n}th`;
}

function describeRecurrence(recurrence) {
  const type = recurrence?.type || 'daily';
  if (type === 'daysOfWeek') {
    return [...recurrence.daysOfWeek].sort((a, b) => a - b).map(d => WEEKDAY_SHORT[d]).join(', ');
  }
  if (type === 'monthlyDate') {
    return `Monthly on the ${ordinal(recurrence.dayOfMonth)}`;
  }
  if (type === 'once') {
    const [y, m, d] = recurrence.date.split('-').map(Number);
    return `Once · ${new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return null;
}

// ---- Date helpers ----
function formatTime(time) {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Storage ----
async function loadReminders() {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  const parsed = value ? JSON.parse(value) : [];
  // Reminders saved before the streak/recurrence features existed won't have these fields.
  reminders = parsed.map(r => ({
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedDate: null,
    recurrence: { type: 'daily' },
    ...r,
  }));
  const { value: idValue } = await Preferences.get({ key: NEXT_ID_KEY });
  nextId = idValue ? parseInt(idValue, 10) : 1;
}

async function saveReminders() {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(reminders) });
}

async function saveNextId() {
  await Preferences.set({ key: NEXT_ID_KEY, value: String(nextId) });
}

// ---- Notifications ----
// 'daysOfWeek' reminders need one native notification per weekday, since
// Capacitor's schedule.on only takes a single weekday value. Sub-IDs are
// derived from the reminder id so they can be recomputed for cancellation
// without storing them separately.
function notificationIdsFor(reminder) {
  const recurrence = reminder.recurrence || { type: 'daily' };
  if (recurrence.type === 'daysOfWeek') {
    return (recurrence.daysOfWeek || []).map(dow => reminder.id * 100 + dow);
  }
  return [reminder.id];
}

async function scheduleNotification(reminder) {
  const [hour, minute] = reminder.time.split(':').map(Number);
  const recurrence = reminder.recurrence || { type: 'daily' };
  const body = `Time for: ${reminder.name}`;
  let notifications;

  if (recurrence.type === 'daysOfWeek') {
    notifications = (recurrence.daysOfWeek || []).map(dow => ({
      id: reminder.id * 100 + dow,
      title: 'Tally',
      body,
      // Capacitor's weekday is 1-7 (Sunday=1); JS Date#getDay() is 0-6 (Sunday=0).
      schedule: { on: { weekday: dow + 1, hour, minute }, allowWhileIdle: true },
      sound: 'default',
    }));
  } else if (recurrence.type === 'monthlyDate') {
    notifications = [{
      id: reminder.id,
      title: 'Tally',
      body,
      schedule: { on: { day: recurrence.dayOfMonth, hour, minute }, allowWhileIdle: true },
      sound: 'default',
    }];
  } else if (recurrence.type === 'once') {
    const [y, m, d] = recurrence.date.split('-').map(Number);
    notifications = [{
      id: reminder.id,
      title: 'Tally',
      body,
      schedule: { at: new Date(y, m - 1, d, hour, minute), allowWhileIdle: true },
      sound: 'default',
    }];
  } else {
    notifications = [{
      id: reminder.id,
      title: 'Tally',
      body,
      schedule: { on: { hour, minute }, allowWhileIdle: true },
      sound: 'default',
    }];
  }

  try {
    await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.error('Could not schedule notification', e);
  }
}

async function cancelNotification(reminder) {
  try {
    const ids = notificationIdsFor(reminder).map(id => ({ id }));
    if (ids.length) await LocalNotifications.cancel({ notifications: ids });
  } catch (e) {
    console.error('Could not cancel notification', e);
  }
}

async function rescheduleAll() {
  for (const reminder of reminders) {
    await scheduleNotification(reminder);
  }
}

async function checkPermissions() {
  try {
    const status = await LocalNotifications.checkPermissions();
    permissionBanner.hidden = status.display === 'granted';
    return status.display === 'granted';
  } catch (e) {
    // Not running inside the native shell (e.g. plain browser preview) — hide the banner.
    permissionBanner.hidden = true;
    return false;
  }
}

enableNotifsBtn.addEventListener('click', async () => {
  try {
    const result = await LocalNotifications.requestPermissions();
    if (result.display === 'granted') {
      permissionBanner.hidden = true;
      await rescheduleAll();
    }
  } catch (e) {
    console.error('Could not request notification permission', e);
  }
});

// ---- CRUD ----
async function addReminder(name, time, recurrence) {
  const reminder = {
    id: nextId++,
    name,
    time,
    recurrence,
    takenDate: null,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedDate: null,
  };
  reminders.push(reminder);
  await saveReminders();
  await saveNextId();
  await scheduleNotification(reminder);
  render();
}

async function toggleTaken(id) {
  const idx = reminders.findIndex(r => r.id === id);
  if (idx === -1) return;
  const reminder = reminders[idx];
  const today = todayKey();
  if (reminder.takenDate === today) {
    reminder.takenDate = null;
  } else {
    reminder.takenDate = today;
    reminders[idx] = markReminderTaken(reminder, today);
  }
  await saveReminders();
  render();
}

async function deleteReminder(id) {
  const reminder = reminders.find(r => r.id === id);
  reminders = reminders.filter(r => r.id !== id);
  await saveReminders();
  if (reminder) await cancelNotification(reminder);
  render();
}

async function updateReminder(id, name, time, recurrence) {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  await cancelNotification(reminder); // cancel using the OLD recurrence's notification ids first
  reminder.name = name;
  reminder.time = time;
  reminder.recurrence = recurrence;
  await saveReminders();
  await scheduleNotification(reminder);
  editingId = null;
  render();
}

// ---- Rendering ----
function render() {
  listEl.innerHTML = '';
  const today = todayKey();

  if (reminders.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;

  const sorted = [...reminders].sort((a, b) => a.time.localeCompare(b.time));

  sorted.forEach(reminder => {
    const taken = reminder.takenDate === today;
    const item = document.createElement('div');

    if (editingId === reminder.id) {
      item.className = 'reminder-item editing';
      item.innerHTML = `
        <div class="edit-row">
          <input type="text" class="edit-name" value="${escapeHtml(reminder.name)}" maxlength="60">
          <input type="time" class="edit-time" value="${reminder.time}">
        </div>
        <div class="recurrence-fields">${renderRecurrenceFields(reminder.recurrence)}</div>
        <div class="edit-actions">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-save">Save</button>
        </div>
      `;
      wireRecurrenceControls(item);
      item.querySelector('.btn-cancel').addEventListener('click', () => {
        editingId = null;
        render();
      });
      item.querySelector('.btn-save').addEventListener('click', () => {
        const name = item.querySelector('.edit-name').value.trim();
        const time = item.querySelector('.edit-time').value;
        const recurrence = readRecurrenceFromForm(item);
        if (!name || !time || !recurrence) return;
        updateReminder(reminder.id, name, time, recurrence);
      });
    } else {
      const onGrace = isOnGrace(reminder, today);
      const streakBadge = reminder.currentStreak > 0
        ? `<span class="streak-badge${onGrace ? ' streak-badge--grace' : ''}" title="Longest streak: ${reminder.longestStreak} day${reminder.longestStreak === 1 ? '' : 's'}">🔥 ${reminder.currentStreak}</span>`
        : '';
      const recurrenceLabel = describeRecurrence(reminder.recurrence);
      item.className = 'reminder-item' + (taken ? ' taken' : '');
      item.innerHTML = `
        <button class="check-btn" aria-label="${taken ? 'Mark not taken' : 'Mark taken'}">${taken ? '✓' : ''}</button>
        <div class="reminder-info">
          <span class="reminder-name">${escapeHtml(reminder.name)}</span>
          <span class="reminder-time">${formatTime(reminder.time)}${recurrenceLabel ? ` · ${recurrenceLabel}` : ''}</span>
        </div>
        ${streakBadge}
        <button class="delete-btn" aria-label="Delete">✕</button>
      `;
      item.querySelector('.check-btn').addEventListener('click', () => toggleTaken(reminder.id));
      item.querySelector('.reminder-info').addEventListener('click', () => {
        editingId = reminder.id;
        render();
      });
      item.querySelector('.delete-btn').addEventListener('click', () => deleteReminder(reminder.id));
    }

    listEl.appendChild(item);
  });
}

// ---- Add form ----
recurrenceFieldsEl.innerHTML = renderRecurrenceFields();
wireRecurrenceControls(addForm);

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const time = timeInput.value;
  const recurrence = readRecurrenceFromForm(addForm);
  if (!name || !time || !recurrence) return;
  await addReminder(name, time, recurrence);
  nameInput.value = '';
  timeInput.value = '';
  recurrenceFieldsEl.innerHTML = renderRecurrenceFields();
  wireRecurrenceControls(addForm);
  nameInput.focus();
});

// ---- Init ----
async function init() {
  await loadReminders();
  reminders = checkStaleStreaks(reminders);
  await saveReminders();
  render();
  await checkPermissions();
}

init();
