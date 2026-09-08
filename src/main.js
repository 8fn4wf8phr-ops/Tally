import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
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
const permissionBanner = document.getElementById('permissionBanner');
const enableNotifsBtn = document.getElementById('enableNotifsBtn');

// ---- Date helpers ----
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  reminders = value ? JSON.parse(value) : [];
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
async function scheduleNotification(reminder) {
  const [hour, minute] = reminder.time.split(':').map(Number);
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: reminder.id,
        title: 'Tally',
        body: `Time for: ${reminder.name}`,
        schedule: { on: { hour, minute }, allowWhileIdle: true },
      }],
    });
  } catch (e) {
    console.error('Could not schedule notification', e);
  }
}

async function cancelNotification(id) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
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
async function addReminder(name, time) {
  const reminder = { id: nextId++, name, time, takenDate: null };
  reminders.push(reminder);
  await saveReminders();
  await saveNextId();
  await scheduleNotification(reminder);
  render();
}

async function toggleTaken(id) {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  const today = todayKey();
  reminder.takenDate = reminder.takenDate === today ? null : today;
  await saveReminders();
  render();
}

async function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  await saveReminders();
  await cancelNotification(id);
  render();
}

async function updateReminder(id, name, time) {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  reminder.name = name;
  reminder.time = time;
  await saveReminders();
  await scheduleNotification(reminder); // re-scheduling with the same id overwrites the old time
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
        <div class="edit-actions">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-save">Save</button>
        </div>
      `;
      item.querySelector('.btn-cancel').addEventListener('click', () => {
        editingId = null;
        render();
      });
      item.querySelector('.btn-save').addEventListener('click', () => {
        const name = item.querySelector('.edit-name').value.trim();
        const time = item.querySelector('.edit-time').value;
        if (!name || !time) return;
        updateReminder(reminder.id, name, time);
      });
    } else {
      item.className = 'reminder-item' + (taken ? ' taken' : '');
      item.innerHTML = `
        <button class="check-btn" aria-label="${taken ? 'Mark not taken' : 'Mark taken'}">${taken ? '✓' : ''}</button>
        <div class="reminder-info">
          <span class="reminder-name">${escapeHtml(reminder.name)}</span>
          <span class="reminder-time">${formatTime(reminder.time)}</span>
        </div>
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
addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const time = timeInput.value;
  if (!name || !time) return;
  await addReminder(name, time);
  nameInput.value = '';
  timeInput.value = '';
  nameInput.focus();
});

// ---- Init ----
async function init() {
  await loadReminders();
  render();
  await checkPermissions();
}

init();
