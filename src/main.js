import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Badge } from '@capawesome/capacitor-badge';
import { markReminderTaken, checkStaleStreaks, isOnGrace, isStreakEligible, todayKey } from './streak.js';
import { parseVoiceInput } from './voice.js';
import { isVoiceAvailable, ensureVoicePermissions, startListening } from './voiceInput.js';
import { getContextualGreeting, getEmptyStateMessage, isStreakMilestone, getMilestoneMessage, isStreakAcknowledgment, getStreakAcknowledgment, getStreakResetMessage, getNotificationBody } from './personalization.js';
import { getPendingToday, countOverdue, isExpiredOneTime, isAllDoneToday, appliesToday, filterForView, nextOccurrence, describeDay } from './due.js';
import {
  ringProgress,
  ringDashOffset,
  staggerDelay,
  SWIPE_ACTION_WIDTH,
  clampSwipe,
  resolveSwipeSnap,
  clampCompleteSwipe,
  shouldCompleteOnRelease,
  isConfettiMilestone,
} from './motion.js';
import {
  ACCENT_THEMES,
  APPEARANCE_MODES,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  resolveScheme,
  DEFAULT_ACCENT_THEME,
  getAccentTheme,
  GREETING_STYLES,
  DEFAULT_GREETING_STYLE,
  normalizeGreetingStyle,
  GRACE_PERIOD_OPTIONS,
  DEFAULT_REMINDER_DEFAULTS,
  REMINDER_COLORS,
  normalizeReminderColor,
  getReminderColorHex,
  graceOccurrencesForHours,
  DEFAULT_QUIET_HOURS,
  isWithinQuietHours,
} from './settings.js';
import './style.css';

const STORAGE_KEY = 'tally-reminders';
const NEXT_ID_KEY = 'tally-next-id';
const USER_NAME_KEY = 'tally-user-name';
const ONBOARDED_KEY = 'tally-onboarded';
const ACCENT_THEME_KEY = 'tally-accent-theme';
const APPEARANCE_KEY = 'tally-appearance';
const REMINDER_DEFAULTS_KEY = 'tally-reminder-defaults';
const QUIET_HOURS_KEY = 'tally-quiet-hours';
const GREETING_STYLE_KEY = 'tally-greeting-style';

let reminders = [];
let nextId = 1;
let editingId = null;
let userName = null;
let accentTheme = DEFAULT_ACCENT_THEME;
let appearance = DEFAULT_APPEARANCE;
let greetingStyle = DEFAULT_GREETING_STYLE;
let reminderDefaults = { ...DEFAULT_REMINDER_DEFAULTS };
let quietHours = { ...DEFAULT_QUIET_HOURS };
let justTakenId = null; // only this row plays the checkmark draw-in
let justIncrementedStreakId = null; // only this row's streak ring plays the pop
let wasAllDoneToday = false; // tracks the *transition* into all-done, not just the state
let openSwipeId = null; // the row currently swiped open, if any
let activeSettingsTab = 'personal';
let activeView = 'today'; // Home tab: 'today' | 'upcoming' | 'done'
let detailId = null; // the reminder whose detail screen is open, if any
const ringProgressById = new Map(); // last-rendered ring fill, so changes can animate

const listEl = document.getElementById('reminderList');
const emptyStateEl = document.getElementById('emptyState');
const addForm = document.getElementById('addForm');
const nameInput = document.getElementById('nameInput');
const timeInput = document.getElementById('timeInput');
const recurrenceFieldsEl = document.getElementById('recurrenceFields');
const colorFieldsEl = document.getElementById('colorFields');
const defaultColorEl = document.getElementById('defaultColorSwatches');
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
const greetingStyleToggleEl = document.getElementById('greetingStyleToggle');
const themeSwatchesEl = document.getElementById('themeSwatches');
const appearanceToggleEl = document.getElementById('appearanceToggle');
const graceOptionsEl = document.getElementById('graceOptions');
const soundToggleEl = document.getElementById('soundToggle');
const quietHoursToggleEl = document.getElementById('quietHoursToggle');
const quietHoursRangeEl = document.getElementById('quietHoursRange');
const quietHoursStartInput = document.getElementById('quietHoursStart');
const quietHoursEndInput = document.getElementById('quietHoursEnd');
const onboardingScreen = document.getElementById('onboardingScreen');
const onboardingNameInput = document.getElementById('onboardingNameInput');
const onboardingContinueBtn = document.getElementById('onboardingContinueBtn');
const onboardingSkipBtn = document.getElementById('onboardingSkipBtn');
const milestoneModal = document.getElementById('milestoneModal');
const milestoneMessageEl = document.getElementById('milestoneMessage');
const toastEl = document.getElementById('toast');
const toastMessageEl = document.getElementById('toastMessage');
const appEl = document.getElementById('app');
const skeletonEl = document.getElementById('skeletonList');
const confettiEl = document.getElementById('confetti');
const allDoneBannerEl = document.getElementById('allDoneBanner');
const allDoneConfettiEl = document.getElementById('allDoneConfetti');
const settingsTabsEl = document.getElementById('settingsTabs');
const openAddBtn = document.getElementById('openAddBtn');
const addScreen = document.getElementById('addScreen');
const addCloseBtn = document.getElementById('addCloseBtn');
const editScreen = document.getElementById('editScreen');
const editForm = document.getElementById('editForm');
const editCloseBtn = document.getElementById('editCloseBtn');
const editCancelBtn = document.getElementById('editCancelBtn');
const editNameInput = document.getElementById('editNameInput');
const editTimeInput = document.getElementById('editTimeInput');
const editRecurrenceFieldsEl = document.getElementById('editRecurrenceFields');
const editColorFieldsEl = document.getElementById('editColorFields');
const notesInput = document.getElementById('notesInput');
const editNotesInput = document.getElementById('editNotesInput');
const viewTabsEl = document.getElementById('viewTabs');
const emptyStateSubEl = document.getElementById('emptyStateSub');
const detailScreen = document.getElementById('detailScreen');
const detailBackBtn = document.getElementById('detailBackBtn');
const detailTitleEl = document.getElementById('detailTitle');
const detailWhenEl = document.getElementById('detailWhen');
const detailRepeatEl = document.getElementById('detailRepeat');
const detailNotesBlockEl = document.getElementById('detailNotesBlock');
const detailNotesEl = document.getElementById('detailNotes');
const detailCompleteBtn = document.getElementById('detailCompleteBtn');
const detailSnoozeBtn = document.getElementById('detailSnoozeBtn');
const detailEditBtn = document.getElementById('detailEditBtn');

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

// ---- Motion helpers ----
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Adds an animation class, resolves when it finishes (with a timeout as a
// safety net), and always cleans the class up.
function playAnimation(el, className) {
  return new Promise(resolve => {
    if (prefersReducedMotion()) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener('animationend', onEnd);
      el.classList.remove(className);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target === el) done();
    };
    // Safety net only: if animationend never arrives (app backgrounded
    // mid-slide, say) the UI must not hang. Generous so it never cuts a slide short.
    const timer = setTimeout(done, 1000);
    el.addEventListener('animationend', onEnd);
    el.classList.add(className);
  });
}

function bounce(el) {
  if (!el) return;
  el.classList.remove('just-selected');
  void el.offsetWidth; // restart the animation if it's already running
  el.classList.add('just-selected');
  el.addEventListener('animationend', () => el.classList.remove('just-selected'), { once: true });
}

// Push navigation: the incoming screen slides in from the right while the
// outgoing one slides off to the left.
function pushScreen(incoming, outgoing) {
  incoming.hidden = false;
  return Promise.all([
    playAnimation(incoming, 'anim-in-right'),
    playAnimation(outgoing, 'anim-out-left'),
  ]);
}

// Back navigation: the reverse. The leaving screen is hidden in the same
// tick its animation ends, so it can't flash back at its resting position.
function popScreen(leaving, returning) {
  return Promise.all([
    playAnimation(leaving, 'anim-out-right').then(() => { leaving.hidden = true; }),
    playAnimation(returning, 'anim-in-left'),
  ]);
}

const CONFETTI_COLORS = ['#ffffff', '#ffe08a', '#ffb3c1', '#c7f0ff', '#d9ccff'];

// Particles are generated here, but the motion itself is pure CSS keyframes.
// `count` lets the "all done for today" moment fire a fuller burst than an
// individual milestone without needing a second implementation.
function burstConfetti(target = confettiEl, count = 24) {
  target.innerHTML = '';
  if (prefersReducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 90 + Math.random() * 80;
    const piece = document.createElement('span');
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance - 30}px`); // slight upward bias
    piece.style.setProperty('--rot', `${Math.round(Math.random() * 540 - 270)}deg`);
    piece.style.setProperty('--delay', `${Math.round(Math.random() * 120)}ms`);
    piece.style.setProperty('--c', CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    target.appendChild(piece);
  }
}

// ---- Reminder color picker ----
// One swatch per palette color, plus a leading "match the app theme" swatch
// (value null) — the look every reminder had before colors existed.
function renderColorSwatches(selectedId) {
  const auto = `<button type="button" class="color-swatch color-swatch--auto${selectedId ? '' : ' selected'}" data-color="" aria-label="Match app theme" title="Match app theme"></button>`;
  const swatches = REMINDER_COLORS.map(c => `
    <button type="button" class="color-swatch${c.id === selectedId ? ' selected' : ''}" data-color="${c.id}" style="background:${c.hex}" aria-label="${c.label}" title="${c.label}"></button>
  `).join('');
  return auto + swatches;
}

function wireColorSwatches(container, onChange) {
  container.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('selected', b === btn));
      bounce(btn);
      if (onChange) onChange(btn.dataset.color || null);
    });
  });
}

function readColorFromContainer(container) {
  return normalizeReminderColor(container.querySelector('.color-swatch.selected')?.dataset.color);
}

function renderAddFormColor() {
  colorFieldsEl.innerHTML = renderColorSwatches(reminderDefaults.defaultColor);
  wireColorSwatches(colorFieldsEl);
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
    notes: '',
    ...r,
    color: normalizeReminderColor(r.color),
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

async function loadGreetingStyle() {
  const { value } = await Preferences.get({ key: GREETING_STYLE_KEY });
  greetingStyle = normalizeGreetingStyle(value);
}

async function saveGreetingStyle(style) {
  greetingStyle = normalizeGreetingStyle(style);
  await Preferences.set({ key: GREETING_STYLE_KEY, value: greetingStyle });
}

function renderGreeting() {
  greetingEl.textContent = getContextualGreeting({
    style: greetingStyle,
    pendingTitles: getPendingToday(reminders).map(r => r.name),
    name: userName,
  });
}

// ---- App icon badge ----
// Count of reminders whose time has passed today and aren't taken yet. Runs
// off the reminder list alone — no name or preference dependency. Only talks
// to the plugin when the count actually changes, because on iOS clearing the
// badge also clears delivered notifications from Notification Center.
let lastBadgeCount = null;

async function updateBadge() {
  const count = countOverdue(reminders);
  if (count === lastBadgeCount) return;
  lastBadgeCount = count;
  try {
    if (count > 0) {
      await Badge.set({ count });
    } else {
      await Badge.clear();
    }
  } catch (e) {
    // Unsupported (plain browser) or badge permission not granted yet.
    console.warn('Could not update badge', e);
  }
}

let milestoneTimer = null;

function showMilestoneModal(streak) {
  const message = getMilestoneMessage(streak, userName);
  if (!message) return;
  clearTimeout(milestoneTimer);
  milestoneMessageEl.textContent = message;
  if (isConfettiMilestone(streak)) {
    burstConfetti();
  } else {
    confettiEl.innerHTML = '';
  }
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

// ---- Appearance (accent theme) ----
async function loadAccentTheme() {
  const { value } = await Preferences.get({ key: ACCENT_THEME_KEY });
  accentTheme = ACCENT_THEMES[value] ? value : DEFAULT_ACCENT_THEME;
}

// Light / dark. 'system' follows iOS live (the media query listener below);
// light and dark force it. The resolved scheme lands on <html data-scheme>,
// which style.css keys its dark tokens off, and also picks which accent
// variant applyAccentTheme uses.
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function currentScheme() {
  return resolveScheme(appearance, systemDarkQuery.matches);
}

async function loadAppearance() {
  const { value } = await Preferences.get({ key: APPEARANCE_KEY });
  appearance = normalizeAppearance(value);
}

async function saveAppearance(mode) {
  appearance = normalizeAppearance(mode);
  await Preferences.set({ key: APPEARANCE_KEY, value: appearance });
  applyAccentTheme();
}

systemDarkQuery.addEventListener('change', () => {
  if (appearance === 'system') applyAccentTheme();
});

// Sets the CSS custom properties every accent-colored rule in style.css
// reads from, plus the light/dark scheme they sit on. Called on init (before
// render, to avoid a flash of the default color) and again immediately
// whenever the theme or appearance changes.
function applyAccentTheme() {
  const scheme = currentScheme();
  const theme = getAccentTheme(accentTheme, scheme);
  const rootEl = document.documentElement;
  rootEl.dataset.scheme = scheme;
  const root = rootEl.style;
  root.setProperty('--accent-color', theme.accent);
  root.setProperty('--accent-color-dark', theme.accentDark);
  root.setProperty('--accent-color-light', theme.accentLight);
}

async function saveAccentTheme(id) {
  accentTheme = ACCENT_THEMES[id] ? id : DEFAULT_ACCENT_THEME;
  await Preferences.set({ key: ACCENT_THEME_KEY, value: accentTheme });
  applyAccentTheme();
}

// ---- Reminder defaults (grace period, notification sound) ----
async function loadReminderDefaults() {
  const { value } = await Preferences.get({ key: REMINDER_DEFAULTS_KEY });
  reminderDefaults = value
    ? { ...DEFAULT_REMINDER_DEFAULTS, ...JSON.parse(value) }
    : { ...DEFAULT_REMINDER_DEFAULTS };
  reminderDefaults.defaultColor = normalizeReminderColor(reminderDefaults.defaultColor);
}

async function saveReminderDefaults(next) {
  reminderDefaults = next;
  await Preferences.set({ key: REMINDER_DEFAULTS_KEY, value: JSON.stringify(reminderDefaults) });
}

// ---- Quiet hours ----
async function loadQuietHours() {
  const { value } = await Preferences.get({ key: QUIET_HOURS_KEY });
  quietHours = value ? { ...DEFAULT_QUIET_HOURS, ...JSON.parse(value) } : { ...DEFAULT_QUIET_HOURS };
}

async function saveQuietHours(next) {
  quietHours = next;
  await Preferences.set({ key: QUIET_HOURS_KEY, value: JSON.stringify(quietHours) });
}

// ---- Settings screen rendering ----
// Same convention as the recurrence fields: render an innerHTML block from
// current state, then wire it — re-run on open and after every change so the
// selected state always reflects what's actually saved.
function renderOnOffToggle(container, value, onChange) {
  container.innerHTML = `
    <button type="button" class="segmented-btn${value ? ' selected' : ''}" data-value="true">On</button>
    <button type="button" class="segmented-btn${!value ? ' selected' : ''}" data-value="false">Off</button>
  `;
  container.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => onChange(btn.dataset.value === 'true'));
  });
}

function renderSettingsScreen() {
  greetingStyleToggleEl.innerHTML = GREETING_STYLES.map(style => `
    <button type="button" class="segmented-btn${style.value === greetingStyle ? ' selected' : ''}" data-style="${style.value}">${style.label}</button>
  `).join('');
  greetingStyleToggleEl.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await saveGreetingStyle(btn.dataset.style);
      renderSettingsScreen();
      renderGreeting();
    });
  });

  appearanceToggleEl.innerHTML = APPEARANCE_MODES.map(mode => `
    <button type="button" class="segmented-btn${mode.value === appearance ? ' selected' : ''}" data-mode="${mode.value}">${mode.label}</button>
  `).join('');
  appearanceToggleEl.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await saveAppearance(btn.dataset.mode);
      renderSettingsScreen();
    });
  });

  themeSwatchesEl.innerHTML = Object.entries(ACCENT_THEMES).map(([id, theme]) => `
    <button type="button" class="theme-swatch${id === accentTheme ? ' selected' : ''}" data-theme="${id}" style="background:${getAccentTheme(id, currentScheme()).accent}" aria-label="${theme.label} theme"></button>
  `).join('');
  themeSwatchesEl.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.theme;
      await saveAccentTheme(themeId);
      renderSettingsScreen();
      bounce(themeSwatchesEl.querySelector(`[data-theme="${themeId}"]`));
    });
  });

  graceOptionsEl.innerHTML = GRACE_PERIOD_OPTIONS.map(hours => `
    <button type="button" class="segmented-btn${hours === reminderDefaults.gracePeriodHours ? ' selected' : ''}" data-hours="${hours}">${hours === 0 ? 'None' : hours + 'h'}</button>
  `).join('');
  graceOptionsEl.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await saveReminderDefaults({ ...reminderDefaults, gracePeriodHours: Number(btn.dataset.hours) });
      renderSettingsScreen();
      render(); // grace period affects the isOnGrace badge shown on each reminder
    });
  });

  defaultColorEl.innerHTML = renderColorSwatches(reminderDefaults.defaultColor);
  wireColorSwatches(defaultColorEl, async (id) => {
    await saveReminderDefaults({ ...reminderDefaults, defaultColor: id });
    renderAddFormColor(); // new reminders start from the new default
  });

  renderOnOffToggle(soundToggleEl, reminderDefaults.soundEnabled, async (enabled) => {
    await saveReminderDefaults({ ...reminderDefaults, soundEnabled: enabled });
    renderSettingsScreen();
  });

  renderOnOffToggle(quietHoursToggleEl, quietHours.enabled, async (enabled) => {
    await saveQuietHours({ ...quietHours, enabled });
    renderSettingsScreen();
  });
  quietHoursRangeEl.hidden = !quietHours.enabled;
  quietHoursStartInput.value = quietHours.start;
  quietHoursEndInput.value = quietHours.end;
}

quietHoursStartInput.addEventListener('change', async () => {
  await saveQuietHours({ ...quietHours, start: quietHoursStartInput.value });
});

quietHoursEndInput.addEventListener('change', async () => {
  await saveQuietHours({ ...quietHours, end: quietHoursEndInput.value });
});

// ---- Onboarding ----
onboardingNameInput.addEventListener('input', () => {
  onboardingContinueBtn.disabled = onboardingNameInput.value.trim().length === 0;
});

async function finishOnboarding(name) {
  await saveUserName(name);
  await Preferences.set({ key: ONBOARDED_KEY, value: 'true' });
  renderGreeting();
  render();
  // Onboarding exits left as the home screen enters from the right.
  await Promise.all([
    playAnimation(onboardingScreen, 'anim-out-left').then(() => { onboardingScreen.hidden = true; }),
    playAnimation(appEl, 'anim-in-right'),
  ]);
}

onboardingContinueBtn.addEventListener('click', () => {
  const name = onboardingNameInput.value.trim();
  if (!name) return;
  finishOnboarding(name);
});

onboardingSkipBtn.addEventListener('click', () => finishOnboarding(null));

// ---- Settings ----
function showSettingsTab(tab) {
  activeSettingsTab = tab;
  settingsTabsEl.querySelectorAll('.segmented-btn').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('selected', active);
    btn.setAttribute('aria-selected', String(active));
  });
  // Panels share one grid cell, so toggling this class cross-fades them.
  settingsScreen.querySelectorAll('.settings-panel').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.panel === tab);
  });
}

settingsTabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) showSettingsTab(btn.dataset.tab);
});

// Every full-screen screen (settings, add, edit) opens and closes through
// these, so they all share the same slide and can't be triggered mid-slide.
let screenBusy = false;

// `from` is the screen underneath: the home list by default, or the detail
// screen when Edit is opened from it (so Back returns there, not home).
async function openScreen(screen, prepare, from = appEl) {
  if (screenBusy) return false;
  screenBusy = true;
  if (prepare) prepare();
  await pushScreen(screen, from);
  screenBusy = false;
  return true;
}

async function closeScreen(screen, to = appEl) {
  if (screenBusy) return false;
  screenBusy = true;
  await popScreen(screen, to);
  screenBusy = false;
  return true;
}

settingsBtn.addEventListener('click', () => openScreen(settingsScreen, () => {
  settingsNameInput.value = userName || '';
  renderSettingsScreen();
  showSettingsTab(activeSettingsTab);
}));

settingsCloseBtn.addEventListener('click', () => closeScreen(settingsScreen));

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
  // Quiet hours override the sound setting rather than delaying delivery —
  // for a medication/routine reminder, arriving on time but silent is safer
  // than arriving late. Omitting `sound` entirely is what makes a Capacitor
  // local notification silent on iOS (see @capacitor/local-notifications'
  // LocalNotificationSchema.sound docs).
  const soundField = reminderDefaults.soundEnabled && !isWithinQuietHours(hour, minute, quietHours)
    ? { sound: 'default' }
    : {};
  // The badge lights up when the reminder fires even if the app is closed —
  // iOS runs none of our code then, so it has to ride on the notification.
  // A scheduled notification can only carry a fixed number, so it says 1
  // ("something is due"); the app replaces it with the true count of overdue
  // reminders whenever it's opened or backgrounded.
  // reminderId rides along so a tapped notification can find its row again
  // (see localNotificationActionPerformed below) — the notification's own
  // `id` isn't always the reminder's id (daysOfWeek uses derived sub-ids).
  const deliveryFields = { ...soundField, badge: 1, extra: { reminderId: reminder.id } };
  let notifications;

  if (recurrence.type === 'daysOfWeek') {
    notifications = (recurrence.daysOfWeek || []).map(dow => ({
      id: reminder.id * 100 + dow,
      title: 'Tally',
      body,
      // Capacitor's weekday is 1-7 (Sunday=1); JS Date#getDay() is 0-6 (Sunday=0).
      schedule: { on: { weekday: dow + 1, hour, minute }, allowWhileIdle: true },
      ...deliveryFields,
    }));
  } else if (recurrence.type === 'monthlyDate') {
    notifications = [{
      id: reminder.id,
      title: 'Tally',
      body,
      schedule: { on: { day: recurrence.dayOfMonth, hour, minute }, allowWhileIdle: true },
      ...deliveryFields,
    }];
  } else if (recurrence.type === 'once') {
    const [y, m, d] = recurrence.date.split('-').map(Number);
    notifications = [{
      id: reminder.id,
      title: 'Tally',
      body,
      schedule: { at: new Date(y, m - 1, d, hour, minute), allowWhileIdle: true },
      ...deliveryFields,
    }];
  } else {
    notifications = [{
      id: reminder.id,
      title: 'Tally',
      body,
      schedule: { on: { hour, minute }, allowWhileIdle: true },
      ...deliveryFields,
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
    // A pending snooze belongs to the reminder too, so it goes with it.
    const ids = [...notificationIdsFor(reminder), SNOOZE_ID_BASE + reminder.id].map(id => ({ id }));
    await LocalNotifications.cancel({ notifications: ids });
  } catch (e) {
    console.error('Could not cancel notification', e);
  }
}

// ---- Snooze ----
// One extra one-time notification, 10 minutes out. Its id sits far above
// reminder ids and the daysOfWeek sub-ids (id * 100 + weekday), so it never
// replaces the reminder's real schedule.
const SNOOZE_MINUTES = 10;
const SNOOZE_ID_BASE = 1000000000;

async function scheduleSnooze(reminder) {
  const at = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
  const soundField = reminderDefaults.soundEnabled && !isWithinQuietHours(at.getHours(), at.getMinutes(), quietHours)
    ? { sound: 'default' }
    : {};
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: SNOOZE_ID_BASE + reminder.id,
        title: 'Tally',
        body: getNotificationBody(reminder.name, userName),
        schedule: { at, allowWhileIdle: true },
        ...soundField,
        badge: 1,
        extra: { reminderId: reminder.id },
      }],
    });
    return true;
  } catch (e) {
    console.error('Could not schedule snooze', e);
    return false;
  }
}

async function cancelSnooze(id) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: SNOOZE_ID_BASE + id }] });
  } catch (e) {
    // Not running in the native shell, or nothing was scheduled.
  }
}

async function rescheduleAll() {
  const now = new Date();
  for (const reminder of reminders) {
    if (isExpiredOneTime(reminder, now)) continue;
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

// A notification that arrives while the app is open doesn't touch the badge
// (see presentationOptions in capacitor.config.json); just re-count.
LocalNotifications.addListener('localNotificationReceived', () => updateBadge()).catch(() => {
  // Not running in the native shell (plain browser preview).
});

const NOTIF_HIGHLIGHT_MS = 1800; // matches --dur-highlight in style.css

// On a cold start the tap can fire before init() has finished loading
// reminders and building rows — poll for the row rather than giving up the
// instant it isn't there yet.
function waitForRow(reminderId, { timeout = 6000, interval = 120 } = {}) {
  return new Promise(resolve => {
    const find = () => listEl.querySelector(`.swipe-row[data-reminder-id="${reminderId}"]`);
    const started = Date.now();
    const tick = () => {
      const row = find();
      if (row) { resolve(row); return; }
      if (Date.now() - started >= timeout) { resolve(null); return; }
      setTimeout(tick, interval);
    };
    tick();
  });
}

async function highlightFromNotification(reminderId) {
  // The row only exists on the tab it belongs to, so go there first.
  const reminder = reminders.find(r => r.id === reminderId);
  if (reminder && appliesToday(reminder)) {
    setView(reminder.takenDate === todayKey() ? 'done' : 'today');
  }
  const row = await waitForRow(reminderId);
  if (!row) return; // reminder was deleted, or never rendered within the timeout
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const target = row.querySelector('.reminder-item');
  target.classList.remove('notif-highlight');
  void target.offsetWidth; // restart the animation if a previous tap is still fading
  target.classList.add('notif-highlight');
  setTimeout(() => target.classList.remove('notif-highlight'), NOTIF_HIGHLIGHT_MS);
}

// Tapping a delivered notification opens the app (default Capacitor
// behavior) — this is what scrolls to and highlights the specific reminder
// it was for, found via the reminderId set in scheduleNotification's extra.
LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
  const reminderId = action?.notification?.extra?.reminderId;
  if (reminderId != null) highlightFromNotification(reminderId);
}).catch(() => {
  // Not running in the native shell (plain browser preview).
});

enableNotifsBtn.addEventListener('click', async () => {
  try {
    const result = await LocalNotifications.requestPermissions();
    if (result.display === 'granted') {
      permissionBanner.hidden = true;
      await rescheduleAll();
      lastBadgeCount = null; // badge permission is granted along with notifications
      updateBadge();
    }
  } catch (e) {
    console.error('Could not request notification permission', e);
  }
});

// ---- CRUD ----
async function addReminder(name, time, recurrence, color, notes) {
  const reminder = {
    id: nextId++,
    name,
    time,
    recurrence,
    color,
    notes,
    takenDate: null,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedDate: null,
  };
  reminders.push(reminder);
  await saveReminders();
  await saveNextId();
  await scheduleNotification(reminder);
  // Show the tab the new reminder lives on, so it doesn't seem to vanish.
  setView(appliesToday(reminder) ? 'today' : 'upcoming');
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
    justTakenId = id;
    cancelSnooze(id); // done now, so a pending snooze shouldn't ping later
    reminder.takenDate = today;
    reminders[idx] = markReminderTaken(reminder, today, graceOccurrencesForHours(reminderDefaults.gracePeriodHours));
    const newStreak = reminders[idx].currentStreak;
    if (newStreak > previousStreak) {
      justIncrementedStreakId = id; // real increment this session — the ring pops
      if (isStreakMilestone(newStreak)) {
        showMilestoneModal(newStreak);
      } else if (isStreakAcknowledgment(newStreak)) {
        showToast(getStreakAcknowledgment(newStreak, userName));
      }
    }
  }
  await saveReminders();
  render();
  const justCompleted = justTakenId !== null;
  justTakenId = null;
  justIncrementedStreakId = null;
  // On the Today tab the completed row lingers so its animation can play;
  // once that's had time to finish, a fresh render moves it over to Done.
  if (justCompleted && activeView === 'today') setTimeout(() => render(), COMPLETE_LINGER_MS);
}

const COMPLETE_LINGER_MS = 1400;

async function deleteReminder(id) {
  if (openSwipeId === id) openSwipeId = null;
  const reminder = reminders.find(r => r.id === id);
  reminders = reminders.filter(r => r.id !== id);
  await saveReminders();
  if (reminder) await cancelNotification(reminder);
  render({ animateEntrance: true });
}

async function updateReminder(id, name, time, recurrence, color, notes) {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  await cancelNotification(reminder); // cancel using the OLD recurrence's notification ids first
  reminder.name = name;
  reminder.time = time;
  reminder.recurrence = recurrence;
  reminder.color = color;
  reminder.notes = notes;
  await saveReminders();
  await scheduleNotification(reminder);
  editingId = null;
  render();
}

// ---- Streak ring + swipe-to-delete ----
const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function closeOpenSwipe() {
  const row = listEl.querySelector('.swipe-row.is-open');
  openSwipeId = null;
  if (!row) return;
  row.classList.remove('is-open', 'is-swiping');
  row.querySelector('.reminder-item').style.transform = '';
}

// Horizontal drag on a row: follows the finger, then snaps open/closed
// (leftward, delete — see resolveSwipeSnap) or commits/springs-back
// (rightward, complete — see shouldCompleteOnRelease). Vertical drags are
// left alone so the list still scrolls. `taken` disables the rightward
// gesture — completing an already-completed reminder isn't a thing swipe
// should do (tap-to-undo still works).
function wireSwipe(row, item, id, taken) {
  let tracking = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let lastOffset = 0;
  let rowWidth = 0;
  let suppressClick = false;

  item.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (openSwipeId !== null && openSwipeId !== id) closeOpenSwipe();
    tracking = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    startOffset = openSwipeId === id ? -SWIPE_ACTION_WIDTH : 0;
    lastOffset = startOffset;
    rowWidth = row.getBoundingClientRect().width;
  });

  item.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        tracking = false; // it's a scroll, not a swipe
        return;
      }
      if (Math.abs(dx) < 8) return;
      dragging = true;
      row.classList.add('is-dragging', 'is-swiping');
      item.setPointerCapture(e.pointerId);
    }
    const target = startOffset + dx;
    lastOffset = target <= 0 ? clampSwipe(target) : (taken ? 0 : clampCompleteSwipe(target, rowWidth));
    item.style.transform = `translateX(${lastOffset}px)`;
  });

  const finish = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 50);
    row.classList.remove('is-dragging');

    if (lastOffset > 0) {
      if (shouldCompleteOnRelease(lastOffset, rowWidth)) {
        commitComplete(row, item, id, rowWidth);
      } else {
        row.classList.remove('is-swiping');
        item.style.transform = '';
      }
      return;
    }

    if (resolveSwipeSnap(lastOffset) === 'open') {
      openSwipeId = id;
      row.classList.add('is-open', 'is-swiping');
      item.style.transform = `translateX(-${SWIPE_ACTION_WIDTH}px)`;
    } else {
      if (openSwipeId === id) openSwipeId = null;
      row.classList.remove('is-open', 'is-swiping');
      item.style.transform = '';
    }
  };
  item.addEventListener('pointerup', finish);
  item.addEventListener('pointercancel', finish);

  // Capture phase: swallow the click that ends a drag, and make a tap on an
  // open row close it instead of triggering whatever was underneath.
  item.addEventListener('click', (e) => {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
    } else if (openSwipeId === id) {
      e.stopPropagation();
      e.preventDefault();
      closeOpenSwipe();
    }
  }, true);
}

// Past the threshold: finish sliding the content clear and fade it so the
// teal fill reads as "done", then actually mark it taken once that's
// visually settled — same pin-then-commit shape as removeWithAnimation.
function commitComplete(row, item, id, rowWidth) {
  row.classList.add('is-committing');
  item.style.transform = `translateX(${rowWidth}px)`;
  item.style.opacity = '0';
  setTimeout(() => toggleTaken(id), 280);
}

function completeSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
}

document.addEventListener('pointerdown', (e) => {
  if (openSwipeId !== null && !e.target.closest('.swipe-row.is-open')) closeOpenSwipe();
});

// Pins the row's height so it can transition to 0, then deletes for real once
// the collapse finishes (with a timeout fallback).
function removeWithAnimation(row, id) {
  if (row.classList.contains('is-removing')) return;
  row.style.height = `${row.offsetHeight}px`;
  void row.offsetHeight;
  row.classList.add('is-removing');
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    deleteReminder(id);
  };
  row.addEventListener('transitionend', (e) => {
    if (e.target === row && e.propertyName === 'height') finish();
  });
  setTimeout(finish, 450);
}

function checkSvg(animate) {
  return `<svg class="check-svg${animate ? ' check-svg--draw' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>`;
}

// Only the moment it *becomes* fully done plays the entrance + bigger
// confetti burst; staying done across unrelated re-renders does nothing,
// and it reverts cleanly (new reminder added, one unmarked/edited back) the
// instant that's no longer true.
function updateAllDoneBanner() {
  const allDoneNow = isAllDoneToday(reminders);
  // The celebration belongs to the Today tab; elsewhere it stays hidden but
  // the transition is still tracked so switching tabs doesn't replay it.
  if (allDoneNow && activeView === 'today') {
    allDoneBannerEl.hidden = false;
    if (!wasAllDoneToday) {
      playAnimation(allDoneBannerEl, 'all-done-enter');
      burstConfetti(allDoneConfettiEl, 40); // fuller than an individual milestone's 24
    }
  } else {
    allDoneBannerEl.hidden = true;
    allDoneConfettiEl.innerHTML = '';
  }
  wasAllDoneToday = allDoneNow;
}

// ---- Home tabs ----
const EMPTY_VIEW_MESSAGES = {
  today: 'Nothing due today.',
  upcoming: 'Nothing coming up.',
  done: 'Nothing completed yet today.',
};

// What the active tab lists. A reminder checked off on the Today tab stays
// put for a moment (justTakenId) so its checkmark and streak ring can finish
// animating instead of vanishing the instant it's done.
function remindersForView() {
  const list = filterForView(reminders, activeView);
  if (activeView === 'today' && justTakenId !== null && !list.some(r => r.id === justTakenId)) {
    const lingering = reminders.find(r => r.id === justTakenId);
    if (lingering) {
      list.push(lingering);
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
  }
  return list;
}

function setView(view) {
  activeView = view;
  openSwipeId = null;
  viewTabsEl.querySelectorAll('.view-tab').forEach(btn => {
    const selected = btn.dataset.view === view;
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-selected', String(selected));
  });
  render({ animateEntrance: true });
}

viewTabsEl.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-view]');
  if (tab && tab.dataset.view !== activeView) setView(tab.dataset.view);
});

// ---- Rendering ----
// animateEntrance: true only for renders where the list's actual *contents*
// just changed (initial load, add, delete) — every other render (toggling,
// editing, settings, theme, badge resync) rebuilds the DOM the same way but
// skips the stagger, so it doesn't replay just because something unrelated
// updated.
function render({ animateEntrance = false } = {}) {
  skeletonEl.remove(); // real data is here; no-op after the first render
  listEl.innerHTML = '';
  const today = todayKey();
  renderGreeting();
  updateBadge();
  updateAllDoneBanner();

  const visible = remindersForView();
  const emptyMessage = reminders.length === 0 ? getEmptyStateMessage(userName) : EMPTY_VIEW_MESSAGES[activeView];
  // With reminders but nothing due on the Today tab and everything done, the
  // all-done banner already says it; a second empty message would be noise.
  const bannerCoversIt = activeView === 'today' && reminders.length > 0 && isAllDoneToday(reminders);
  const showEmpty = visible.length === 0 && !bannerCoversIt;
  emptyStateEl.querySelector('#emptyStateMessage').textContent = emptyMessage;
  emptyStateSubEl.hidden = !(reminders.length === 0 || activeView === 'today');
  emptyStateEl.hidden = !showEmpty;

  visible.forEach((reminder, index) => {
    const taken = reminder.takenDate === today;
    const upcoming = activeView === 'upcoming';
    const item = document.createElement('div');
    let node = item;
    let ringTargetOffset = null;

    const onGrace = isOnGrace(reminder, today, graceOccurrencesForHours(reminderDefaults.gracePeriodHours));
    let streakRing = '';
    if (isStreakEligible(reminder)) {
      const progress = ringProgress(reminder.currentStreak);
      // Start from the last rendered fill so a changed count animates; a
      // first render (or unchanged count) has nothing to animate.
      const previous = ringProgressById.has(reminder.id) ? ringProgressById.get(reminder.id) : progress;
      ringProgressById.set(reminder.id, progress);
      if (reminder.currentStreak > 0) {
        ringTargetOffset = ringDashOffset(progress, RING_CIRCUMFERENCE);
        const popping = justIncrementedStreakId === reminder.id;
        streakRing = `
          <span class="streak-ring${onGrace ? ' streak-ring--grace' : ''}${popping ? ' is-popping' : ''}" title="Longest streak: ${reminder.longestStreak} day${reminder.longestStreak === 1 ? '' : 's'}">
            <svg viewBox="0 0 38 38" aria-hidden="true">
              <circle class="ring-track" cx="19" cy="19" r="${RING_RADIUS}"/>
              <circle class="ring-fill" cx="19" cy="19" r="${RING_RADIUS}" stroke-dasharray="${RING_CIRCUMFERENCE}" style="stroke-dashoffset:${ringDashOffset(previous, RING_CIRCUMFERENCE)}"/>
            </svg>
            <span class="streak-ring-count">${reminder.currentStreak}</span>
          </span>`;
      }
    }
    const recurrenceLabel = describeRecurrence(reminder.recurrence);
    const colorHex = getReminderColorHex(reminder.color);
    item.className = 'reminder-item' + (taken ? ' taken' : '') + (colorHex ? ' has-color' : '');
    if (colorHex) item.style.setProperty('--reminder-color', colorHex);
    // Upcoming reminders aren't due yet, so there's nothing to check off: a
    // calendar mark stands in for the checkbox and the label leads with the day.
    const leading = upcoming
      ? '<span class="upcoming-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg></span>'
      : `<button class="check-btn" aria-label="${taken ? 'Mark not taken' : 'Mark taken'}">${taken ? checkSvg(justTakenId === reminder.id) : ''}</button>`;
    const timeLabel = upcoming
      ? `${describeDay(nextOccurrence(reminder))} · ${formatTime(reminder.time)}`
      : `${formatTime(reminder.time)}${recurrenceLabel ? ` · ${recurrenceLabel}` : ''}`;
    item.innerHTML = `
      ${leading}
      <div class="reminder-info">
        <span class="reminder-name">${escapeHtml(reminder.name)}</span>
        <span class="reminder-time">${timeLabel}</span>
      </div>
      ${streakRing}
      <button class="delete-btn" aria-label="Delete">✕</button>
    `;
    item.querySelector('.check-btn')?.addEventListener('click', () => toggleTaken(reminder.id));
    item.querySelector('.reminder-info').addEventListener('click', () => openDetail(reminder.id));

    // Wrap in a swipe row: delete sits behind it on the right (revealed
    // sliding left), complete sits behind it on the left (revealed sliding
    // right, not shown at all once already taken).
    const row = document.createElement('div');
    row.className = 'swipe-row' + (openSwipeId === reminder.id ? ' is-open is-swiping' : '');
    row.dataset.reminderId = reminder.id;
    const cannotComplete = taken || upcoming;
    row.innerHTML = (cannotComplete ? '' : `<div class="swipe-complete" aria-hidden="true">${completeSvg()}</div>`)
      + '<button type="button" class="swipe-action" aria-label="Delete reminder">Delete</button>';
    row.appendChild(item);
    if (openSwipeId === reminder.id) item.style.transform = `translateX(-${SWIPE_ACTION_WIDTH}px)`;
    wireSwipe(row, item, reminder.id, cannotComplete);
    row.querySelector('.swipe-action').addEventListener('click', () => removeWithAnimation(row, reminder.id));
    item.querySelector('.delete-btn').addEventListener('click', () => removeWithAnimation(row, reminder.id));
    node = row;

    if (animateEntrance) {
      node.classList.add('row-enter');
      node.style.animationDelay = `${staggerDelay(index)}ms`;
    }
    listEl.appendChild(node);
    if (ringTargetOffset !== null) {
      const fill = item.querySelector('.ring-fill');
      void fill.getBoundingClientRect(); // commit the starting offset so the change transitions
      fill.style.strokeDashoffset = ringTargetOffset;
    }
  });
}

// ---- Add screen ----
function resetAddForm() {
  nameInput.value = '';
  timeInput.value = '';
  notesInput.value = '';
  voiceTimeHint.hidden = true;
  recurrenceFieldsEl.innerHTML = renderRecurrenceFields();
  wireRecurrenceControls(addForm);
  renderAddFormColor();
}

resetAddForm();

openAddBtn.addEventListener('click', async () => {
  const opened = await openScreen(addScreen, resetAddForm);
  if (opened) nameInput.focus();
});

addCloseBtn.addEventListener('click', () => closeScreen(addScreen));

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const time = timeInput.value;
  const recurrence = readRecurrenceFromForm(addForm);
  if (!name || !time || !recurrence) return;
  await addReminder(name, time, recurrence, readColorFromContainer(colorFieldsEl), notesInput.value.trim());
  closeScreen(addScreen);
});

// ---- Detail screen ----
function describeRepeat(recurrence) {
  const type = recurrence?.type || 'daily';
  if (type === 'daily') return 'Every day';
  if (type === 'once') return 'Does not repeat';
  if (type === 'daysOfWeek') return `Weekly on ${describeRecurrence(recurrence)}`;
  return describeRecurrence(recurrence);
}

function renderDetail() {
  const reminder = reminders.find(r => r.id === detailId);
  if (!reminder) return;
  const dueToday = appliesToday(reminder);
  const done = dueToday && reminder.takenDate === todayKey();
  const next = dueToday ? null : nextOccurrence(reminder);
  const day = dueToday ? 'Today' : describeDay(next);

  detailTitleEl.textContent = reminder.name;
  detailWhenEl.textContent = `${day}, ${formatTime(reminder.time)}${done ? ' · Done' : ''}`;
  detailRepeatEl.textContent = describeRepeat(reminder.recurrence);
  detailNotesEl.textContent = reminder.notes || '';
  detailNotesBlockEl.hidden = !reminder.notes;

  // Completing and snoozing only make sense for something that's due today.
  detailCompleteBtn.hidden = !dueToday;
  detailCompleteBtn.textContent = done ? 'Mark incomplete' : 'Mark complete';
  detailSnoozeBtn.hidden = !dueToday || done;
}

function openDetail(id) {
  if (!reminders.some(r => r.id === id)) return;
  openScreen(detailScreen, () => {
    detailId = id;
    renderDetail();
  });
}

async function closeDetail() {
  // Only forget which reminder this was if the screen actually closed — a tap
  // mid-slide is ignored by closeScreen and must leave the screen usable.
  const closed = await closeScreen(detailScreen);
  if (closed) detailId = null;
  return closed;
}

detailBackBtn.addEventListener('click', closeDetail);

// Leave first, then change the list, so the row's own animation (checkmark,
// streak ring, confetti) is what the user sees as the result.
detailCompleteBtn.addEventListener('click', async () => {
  const id = detailId;
  if (!(await closeDetail())) return;
  await toggleTaken(id);
});

detailSnoozeBtn.addEventListener('click', async () => {
  const reminder = reminders.find(r => r.id === detailId);
  if (!reminder) return;
  const ok = await scheduleSnooze(reminder);
  if (ok) {
    await closeDetail();
    showToast(`Snoozed for ${SNOOZE_MINUTES} minutes`);
  } else {
    showToast("Couldn't snooze — check that notifications are allowed");
  }
});

detailEditBtn.addEventListener('click', () => openEdit(detailId, detailScreen));

// ---- Edit screen ----
function openEdit(id, from = appEl) {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  openScreen(editScreen, () => {
    editingId = id;
    editNameInput.value = reminder.name;
    editTimeInput.value = reminder.time;
    editNotesInput.value = reminder.notes || '';
    editRecurrenceFieldsEl.innerHTML = renderRecurrenceFields(reminder.recurrence);
    wireRecurrenceControls(editForm);
    editColorFieldsEl.innerHTML = renderColorSwatches(reminder.color);
    wireColorSwatches(editColorFieldsEl);
  }, from);
}

// Edit is only reachable from the detail screen now, so Back lands there.
function closeEdit() {
  editingId = null;
  closeScreen(editScreen, detailId !== null ? detailScreen : appEl);
}

editCloseBtn.addEventListener('click', closeEdit);
editCancelBtn.addEventListener('click', closeEdit);

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = editNameInput.value.trim();
  const time = editTimeInput.value;
  const recurrence = readRecurrenceFromForm(editForm);
  if (!name || !time || !recurrence || editingId === null) return;
  await updateReminder(editingId, name, time, recurrence, readColorFromContainer(editColorFieldsEl), editNotesInput.value.trim());
  if (detailId !== null) renderDetail(); // refresh it before Back reveals it
  closeEdit();
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
  // Show a hint whenever the time isn't a confident explicit match — a vague
  // guess (no am/pm said) needs confirming, and no match at all needs a
  // heads-up too, since an empty time field alone looks identical to "voice
  // input didn't do anything" rather than "no time was understood."
  if (!parsed.time) {
    voiceTimeHint.textContent = 'No time understood — please set one';
    voiceTimeHint.hidden = false;
  } else if (parsed.time.vague) {
    voiceTimeHint.textContent = 'Please confirm this guessed time';
    voiceTimeHint.hidden = false;
  } else {
    voiceTimeHint.hidden = true;
  }
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
  // Captured before stopping: stopping cancels the native recognition task,
  // which can trigger one more (empty/error) transcript callback — reading
  // latestTranscript only after that await would risk it already having
  // been overwritten by that trailing event.
  const transcript = latestTranscript.trim();
  latestTranscript = '';
  await stopVoiceSession();
  closeVoiceOverlay();
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
  // Theme is applied first, before anything renders, to avoid a flash of
  // the default color. This is fully reliable in the web preview (see the
  // inline bootstrap script in index.html's <head>, which reads localStorage
  // synchronously); on a native device, Preferences is backed by UserDefaults
  // rather than localStorage, which isn't readable synchronously from JS
  // before the page runs — so there, this is the earliest point a flash can
  // be avoided, not a hard guarantee zero frames ever paint the default.
  await loadAccentTheme();
  await loadAppearance();
  applyAccentTheme();

  await loadUserName();
  await loadGreetingStyle();
  renderGreeting();
  await loadReminderDefaults();
  renderAddFormColor();
  await loadQuietHours();
  await loadReminders();
  const graceOccurrences = graceOccurrencesForHours(reminderDefaults.gracePeriodHours);
  const previousStreaks = new Map(reminders.map(r => [r.id, r.currentStreak]));
  reminders = checkStaleStreaks(reminders, todayKey(), graceOccurrences);
  // One toast for the launch, even if several reminders' streaks broke while
  // the app was closed — this is meant to be a gentle nudge, not a list.
  const anyStreakReset = reminders.some(r => previousStreaks.get(r.id) > 0 && r.currentStreak === 0);
  await saveReminders();
  render({ animateEntrance: true });
  if (anyStreakReset) {
    showToast(getStreakResetMessage(userName));
  }
  // Re-sync scheduled notifications on every launch so reminders scheduled
  // before a change (like the badge) pick it up. Same ids replace the old ones.
  if (await checkPermissions()) await rescheduleAll();
  micBtn.hidden = !(await isVoiceAvailable());

  const { value: onboarded } = await Preferences.get({ key: ONBOARDED_KEY });
  if (!onboarded) {
    onboardingScreen.hidden = false;
  }
}

// Backgrounding and resuming: keep the greeting and the icon badge honest,
// since time passes and reminders become overdue while we're not looking.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Leaving the app: make sure the icon shows the current overdue count.
    updateBadge();
  } else {
    // A notification may have set the badge natively while we were away, so
    // forget what we last set and re-sync instead of trusting it.
    lastBadgeCount = null;
    render();
  }
});

init();
