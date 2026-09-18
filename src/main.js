import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { markReminderTaken, checkStaleStreaks, isOnGrace, isStreakEligible, todayKey } from './streak.js';
import { parseVoiceInput } from './voice.js';
import { isVoiceAvailable, ensureVoicePermissions, startListening } from './voiceInput.js';
import { getGreeting, getEmptyStateMessage, isStreakMilestone, getMilestoneMessage, getStreakResetMessage, getNotificationBody } from './personalization.js';
import './style.css';

const STORAGE_KEY = 'tally-reminders';
const NEXT_ID_KEY = 'tally-next-id';
const USER_NAME_KEY = 'tally-user-name';
const ONBOARDED_KEY = 'tally-onboarded';

let reminders = [];
let nextId = 1;
let editingId = null;
let userName = null;

const listEl = document.getElementById('reminderList');
const emptyStateEl = document.getElementById('emptyState');
const addForm = document.getElementById('addForm');
const nameInput = document.getElementById('nameInput');
const timeInput = document.getElementById('timeInput');
const recurrenceFieldsEl = document.getElementById('recurrenceFields');
const permissionBanner = document.getElementById('permissionBanner');
const enableNotifsBtn = document.getElementById('enableNotifsBtn');
const micBtn = document.getElementById('micBtn');
const voiceTimeHint = document.getElementById('voiceTimeHint');
const voiceOverlay = document.getElementById('voiceOverlay');
const voiceStatus = document.getElementById('voiceStatus');
const voiceTranscript = document.getElementById('voiceTranscript');
const voiceCancelBtn = document.getElementById('voiceCancelBtn');
const voiceDoneBtn = document.getElementById('voiceDoneBtn');
const greetingEl = document.getElementById('greeting');
const settingsBtn = document.getElementById('settingsBtn');
const settingsScreen = document.getElementById('settingsScreen');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const settingsNameInput = document.getElementById('settingsNameInput');
const onboardingScreen = document.getElementById('onboardingScreen');
const onboardingNameInput = document.getElementById('onboardingNameInput');
const onboardingContinueBtn = document.getElementById('onboardingContinueBtn');
const onboardingSkipBtn = document.getElementById('onboardingSkipBtn');
const milestoneModal = document.getElementById('milestoneModal');
const milestoneMessageEl = document.getElementById('milestoneMessage');
const toastEl = document.getElementById('toast');
const toastMessageEl = document.getElementById('toastMessage');

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

// ---- Personalization ----
async function loadUserName() {
  const { value } = await Preferences.get({ key: USER_NAME_KEY });
  userName = value || null;
}

async function saveUserName(name) {
  userName = name || null;
  if (userName) {
    await Preferences.set({ key: USER_NAME_KEY, value: userName });
  } else {
    await Preferences.remove({ key: USER_NAME_KEY });
  }
}

function renderGreeting() {
  greetingEl.textContent = getGreeting(userName);
}

let milestoneTimer = null;

function showMilestoneModal(streak) {
  const message = getMilestoneMessage(streak, userName);
  if (!message) return;
  clearTimeout(milestoneTimer);
  milestoneMessageEl.textContent = message;
  milestoneModal.hidden = false;
  milestoneTimer = setTimeout(() => {
    milestoneModal.hidden = true;
  }, 3500);
}

// Low-pressure by design: a toast, not a modal — no backdrop, no dismiss
// button, gone on its own well before it could feel naggy.
let toastTimer = null;

function showToast(message) {
  clearTimeout(toastTimer);
  toastMessageEl.textContent = message;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3000);
}

// ---- Onboarding ----
onboardingNameInput.addEventListener('input', () => {
  onboardingContinueBtn.disabled = onboardingNameInput.value.trim().length === 0;
});

async function finishOnboarding(name) {
  await saveUserName(name);
  await Preferences.set({ key: ONBOARDED_KEY, value: 'true' });
  onboardingScreen.hidden = true;
  renderGreeting();
  render();
}

onboardingContinueBtn.addEventListener('click', () => {
  const name = onboardingNameInput.value.trim();
  if (!name) return;
  finishOnboarding(name);
});

onboardingSkipBtn.addEventListener('click', () => finishOnboarding(null));

// ---- Settings ----
settingsBtn.addEventListener('click', () => {
  settingsNameInput.value = userName || '';
  settingsScreen.hidden = false;
});

settingsCloseBtn.addEventListener('click', () => {
  settingsScreen.hidden = true;
});

settingsNameInput.addEventListener('blur', async () => {
  await saveUserName(settingsNameInput.value.trim());
  renderGreeting();
  render();
});

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
  const body = getNotificationBody(reminder.name, userName);
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
    const previousStreak = reminder.currentStreak;
    reminder.takenDate = today;
    reminders[idx] = markReminderTaken(reminder, today);
    const newStreak = reminders[idx].currentStreak;
    if (newStreak !== previousStreak && isStreakMilestone(newStreak)) {
      showMilestoneModal(newStreak);
    }
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
    emptyStateEl.querySelector('#emptyStateMessage').textContent = getEmptyStateMessage(userName);
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
      const streakBadge = isStreakEligible(reminder) && reminder.currentStreak > 0
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
  voiceTimeHint.hidden = true;
  recurrenceFieldsEl.innerHTML = renderRecurrenceFields();
  wireRecurrenceControls(addForm);
  nameInput.focus();
});

timeInput.addEventListener('input', () => {
  voiceTimeHint.hidden = true;
});

// ---- Voice input ----
// Speech recognition runs entirely on-device (SFSpeechRecognizer with
// requiresOnDeviceRecognition = true, see SpeechInputPlugin.swift) — audio
// never leaves the device. The transcript is only ever a starting point:
// it's parsed into a best guess and dropped into the normal add form for
// the user to review and edit, never saved directly.
let voiceSession = null;
let latestTranscript = '';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function openVoiceOverlay() {
  voiceStatus.textContent = 'Listening…';
  voiceTranscript.textContent = '';
  voiceOverlay.hidden = false;
  micBtn.classList.add('listening');
}

function closeVoiceOverlay() {
  voiceOverlay.hidden = true;
  micBtn.classList.remove('listening');
}

function applyParsedVoiceInput(parsed) {
  nameInput.value = parsed.name;
  timeInput.value = parsed.time ? `${pad2(parsed.time.hour)}:${pad2(parsed.time.minute)}` : '';
  voiceTimeHint.hidden = !parsed.time?.vague;
  const recurrence = parsed.recurrence;
  // The parser deliberately never guesses a date for 'once' (see voice.js) —
  // default it to today so the review form isn't stuck with an empty
  // required field the user has to notice and fill in before Add works.
  if (recurrence.type === 'once' && !recurrence.date) {
    recurrence.date = todayKey();
  }
  recurrenceFieldsEl.innerHTML = renderRecurrenceFields(recurrence);
  wireRecurrenceControls(addForm);
  nameInput.focus();
}

async function stopVoiceSession() {
  if (!voiceSession) return;
  const session = voiceSession;
  voiceSession = null;
  try {
    await session.stop();
  } catch (e) {
    console.error('Could not stop voice session', e);
  }
}

async function finishVoiceInput() {
  await stopVoiceSession();
  closeVoiceOverlay();
  const transcript = latestTranscript.trim();
  latestTranscript = '';
  if (transcript) {
    applyParsedVoiceInput(parseVoiceInput(transcript));
  }
}

micBtn.addEventListener('click', async () => {
  if (voiceSession) return;
  try {
    const permissions = await ensureVoicePermissions();
    if (permissions.speech !== 'granted' || permissions.microphone !== 'granted') {
      voiceStatus.textContent = 'Microphone/speech access denied';
      voiceOverlay.hidden = false;
      return;
    }
    openVoiceOverlay();
    voiceSession = await startListening({
      onTranscript: ({ text, isFinal }) => {
        latestTranscript = text;
        voiceTranscript.textContent = text;
        if (isFinal) finishVoiceInput();
      },
      onError: (err) => {
        voiceStatus.textContent = err?.message ? `Error: ${err.message}` : 'Could not transcribe';
      },
    });
  } catch (e) {
    console.error('Could not start voice input', e);
    voiceStatus.textContent = e?.message || 'Voice input is not available';
    voiceOverlay.hidden = false;
  }
});

voiceDoneBtn.addEventListener('click', finishVoiceInput);

voiceCancelBtn.addEventListener('click', async () => {
  latestTranscript = '';
  await stopVoiceSession();
  closeVoiceOverlay();
});

// ---- Init ----
async function init() {
  await loadUserName();
  renderGreeting();
  await loadReminders();
  const previousStreaks = new Map(reminders.map(r => [r.id, r.currentStreak]));
  reminders = checkStaleStreaks(reminders);
  // One toast for the launch, even if several reminders' streaks broke while
  // the app was closed — this is meant to be a gentle nudge, not a list.
  const anyStreakReset = reminders.some(r => previousStreaks.get(r.id) > 0 && r.currentStreak === 0);
  await saveReminders();
  render();
  if (anyStreakReset) {
    showToast(getStreakResetMessage(userName));
  }
  await checkPermissions();
  micBtn.hidden = !(await isVoiceAvailable());

  const { value: onboarded } = await Preferences.get({ key: ONBOARDED_KEY });
  if (!onboarded) {
    onboardingScreen.hidden = false;
  }
}

init();
