// "Understand Reminder": turns a sentence like "Remind me to call Marcus
// tomorrow at 8 PM" into a draft reminder for the add form.
//
// Deterministic rules do the work, built on voice.js (times, repeats, names).
// Anything that could mean two things becomes a *question* with options
// rather than a silent guess. The draft is plain data: it never saves a
// reminder or touches a notification. The user confirms by pressing Save on
// the add form. Every date is computed from `now` with local calendar
// arithmetic, so "tomorrow" is the user's tomorrow in their own timezone.

import { parseVoiceInput } from '../voice.js';
import { todayKey } from '../streak.js';
import { MAX_REQUEST_LENGTH } from './validation.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_PATTERN = DAY_NAMES.join('|');
const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4,
  june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sept: 8, sep: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60,
};
const NUMBER_PATTERN = `\\d+|${Object.keys(NUMBER_WORDS).join('|')}`;
const PERIOD_HOURS = { morning: 8, afternoon: 14, evening: 19, night: 21 };
export const MAX_COUNT = 10;

// ---- small date helpers (all local calendar arithmetic) ----
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const pad2 = n => String(n).padStart(2, '0');
const dayLabel = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function formatClock({ hour, minute }) {
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad2(minute)} ${period}`;
}

// The next date with this weekday. `includeToday` lets today count.
function nextWeekday(from, dow, includeToday) {
  const start = startOfDay(from);
  const ahead = (dow - start.getDay() + 7) % 7;
  return addDays(start, ahead === 0 && !includeToday ? 7 : ahead);
}

function toNumber(word) {
  const lower = String(word).toLowerCase();
  return /^\d+$/.test(lower) ? parseInt(lower, 10) : NUMBER_WORDS[lower];
}

// Removes the first match of `re` and returns [match, remainingText].
function cut(text, re) {
  const m = re.exec(text);
  if (!m) return [null, text];
  const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return [m, rest];
}

function validDate(year, month, day) {
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
}

// ---- text preparation ----
// "half past two" -> "2:30", "quarter to four" -> "3:45", "5 o'clock" -> "5:00".
// am/pm stays unsaid, so the draft asks about it like any other bare hour.
function spokenTimesToDigits(text) {
  const hourWord = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).filter(w => NUMBER_WORDS[w] <= 12 && w !== 'a' && w !== 'an').join('|')})`;
  const hourOf = word => toNumber(word);
  return text
    .replace(new RegExp(`\\bhalf past ${hourWord}\\b`, 'gi'), (_, h) => `${hourOf(h)}:30`)
    .replace(new RegExp(`\\bquarter past ${hourWord}\\b`, 'gi'), (_, h) => `${hourOf(h)}:15`)
    .replace(new RegExp(`\\bquarter to ${hourWord}\\b`, 'gi'), (_, h) => `${(hourOf(h) + 10) % 12 + 1}:45`)
    .replace(new RegExp(`\\b${hourWord} o['\u2019]clock\\b`, 'gi'), (_, h) => `${hourOf(h)}:00`)
    // "at five thirty" -> "at 5:30"
    .replace(new RegExp(`\\bat ${hourWord} (fifteen|thirty|forty[- ]?five)\\b`, 'gi'), (_, h, mins) => {
      const minute = /fifteen/i.test(mins) ? '15' : (/forty/i.test(mins) ? '45' : '30');
      return `at ${hourOf(h)}:${minute}`;
    })
    // "at eight in the evening" -> "at 8 in the evening" (only when clearly a time, not "at one point")
    .replace(new RegExp(`\\bat ${hourWord}(?=\\s*(?:am|pm|a\\.m\\.|p\\.m\\.|in the |tomorrow|today|tonight|on |every |next |this |$|[,.]))`, 'gi'), (_, h) => `at ${hourOf(h)}`);
}

function normalizeRequest(raw) {
  let text = String(raw).replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  text = text.replace(/^(?:(?:please|hey tally,?|can you|could you)\s+)+/i, '');
  // "on Fridays" -> "every Friday" (voice.js only knows singular weekday names)
  text = text.replace(new RegExp(`\\b(?:on\\s+)?(${DAY_PATTERN})s\\b`, 'gi'), 'every $1');
  // "tomorrow's tasks" / "Friday's list" -> "tomorrow" / "Friday"
  text = text.replace(new RegExp(`\\b(today|tomorrow|tonight|${DAY_PATTERN})['’]s\\b`, 'gi'), '$1');
  text = spokenTimesToDigits(text);
  // "Every Friday at 6 PM, remind me to review my budget"
  let m = text.match(/^(.+?)[,;]?\s+(?:remind me to|remember to)\s+(.+)$/i);
  if (m) return `${m[2]} ${m[1]}`;
  // "Remind me tomorrow at 8 to call Marcus"
  m = text.match(/^remind me\s+(.+?)\s+to\s+(.+)$/i);
  if (m) return `${m[2]} ${m[1]}`;
  return text;
}

// "Add three job applications to tomorrow's tasks" -> count 3 and the
// ordinary request "job applications tomorrow".
function extractCount(text) {
  const m = text.match(new RegExp(`^(?:add|create|make|put)\\s+(${NUMBER_PATTERN})\\s+(.+)$`, 'i'));
  if (!m) return { count: 1, text };
  const count = toNumber(m[1]);
  if (!count || count < 2) return { count: 1, text: m[2] };
  let rest = m[2];
  let schedule = '';
  const listMatch = rest.match(/^(.*?)\s+(?:to|for|on)\s+(.+?)\s+(?:tasks?|list|reminders?|to-?dos?)$/i);
  if (listMatch) {
    rest = listMatch[1];
    schedule = listMatch[2];
  }
  return { count: Math.min(count, MAX_COUNT), text: `${rest} ${schedule}`.trim(), clamped: count > MAX_COUNT };
}

// ---- dates ----
// Pulls date phrases out of the text. Returns what it found plus the text
// that is left over for voice.js to read times, repeats and the title from.
function extractDateInfo(rawText, now) {
  const today = startOfDay(now);
  const questions = [];
  let text = rawText;
  let date = null;
  let time = null;       // exact time implied by the date phrase ("in 2 hours")
  let period = null;     // "tomorrow morning" -> a vague default time
  let m;

  // "in 2 hours", "in 30 minutes", "in an hour", "in 3 days", "in 2 weeks"
  [m, text] = cut(text, new RegExp(`\\bin\\s+(?:half an hour|(${NUMBER_PATTERN})\\s*(minutes?|mins?|hours?|hrs?|days?|weeks?))\\b`, 'i'));
  if (m) {
    const n = m[1] ? toNumber(m[1]) : 30;
    const unit = m[2] ? m[2].toLowerCase() : 'minutes';
    if (unit.startsWith('d') || unit.startsWith('w')) {
      date = addDays(today, n * (unit.startsWith('w') ? 7 : 1));
    } else {
      const target = new Date(now.getTime() + n * (unit.startsWith('h') ? 3600000 : 60000));
      date = startOfDay(target);
      time = { hour: target.getHours(), minute: target.getMinutes() };
    }
  }

  if (!date) {
    [m, text] = cut(text, /\b(?:the\s+)?day after tomorrow\b/i);
    if (m) date = addDays(today, 2);
  }

  if (!date) {
    [m, text] = cut(text, /\b(tomorrow|today|tonight|this)\s+(morning|afternoon|evening|night)\b|\b(tonight|tomorrow|today)\b/i);
    if (m) {
      const word = (m[1] || m[3]).toLowerCase();
      period = m[2] ? m[2].toLowerCase() : (word === 'tonight' ? 'night' : null);
      date = word === 'tomorrow' ? addDays(today, 1) : today;
    }
  }

  if (!date) {
    // "the Monday after next": the Monday following next Monday
    [m, text] = cut(text, new RegExp(`\\b(?:the\\s+)?(${DAY_PATTERN})\\s+after\\s+next\\b`, 'i'));
    if (m) date = addDays(nextWeekday(today, DAY_NAMES.indexOf(m[1].toLowerCase()), false), 7);
  }

  if (!date) {
    [m, text] = cut(text, new RegExp(`\\b(next|this|coming)\\s+(${DAY_PATTERN})\\b`, 'i'));
    if (m) {
      const dow = DAY_NAMES.indexOf(m[2].toLowerCase());
      const word = m[1].toLowerCase();
      if (word === 'next') {
        // "next Friday" is genuinely ambiguous in English, so ask.
        const soonest = nextWeekday(today, dow, false);
        const later = addDays(soonest, 7);
        date = soonest;
        questions.push({
          id: 'date',
          kind: 'choice',
          message: `Which ${DAY_NAMES[dow][0].toUpperCase()}${DAY_NAMES[dow].slice(1)} do you mean?`,
          options: [soonest, later].map(d => ({ label: dayLabel(d), patch: { recurrence: { type: 'once', date: todayKey(d) } } })),
          defaultIndex: 0,
        });
      } else {
        date = nextWeekday(today, dow, true);
      }
    }
  }

  if (!date) {
    [m, text] = cut(text, new RegExp(`\\b(?:on\\s+)?(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i'));
    let month, day, year;
    if (m) {
      month = MONTHS[m[1].toLowerCase()]; day = parseInt(m[2], 10); year = m[3] ? parseInt(m[3], 10) : null;
    } else {
      [m, text] = cut(text, new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_PATTERN})\\b(?:,?\\s+(\\d{4}))?`, 'i'));
      if (m) { day = parseInt(m[1], 10); month = MONTHS[m[2].toLowerCase()]; year = m[3] ? parseInt(m[3], 10) : null; }
    }
    if (m) {
      let found = validDate(year ?? today.getFullYear(), month, day);
      if (found && !year && found < today) found = validDate(today.getFullYear() + 1, month, day);
      date = found;
    }
  }

  if (!date) {
    [m, text] = cut(text, /\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      let year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
      if (year < 100) year += 2000;
      const asMonthDay = a <= 12 ? validDate(year, a - 1, b) : null;
      const asDayMonth = b <= 12 ? validDate(year, b - 1, a) : null;
      const bump = d => (d && !m[3] && d < today ? validDate(year + 1, d.getMonth(), d.getDate()) : d);
      const first = bump(asMonthDay);
      const second = bump(asDayMonth);
      if (first && second && todayKey(first) !== todayKey(second)) {
        date = first;
        questions.push({
          id: 'date',
          kind: 'choice',
          message: `Is ${m[0].replace(/^on\s+/i, '')} month/day or day/month?`,
          options: [first, second].map(d => ({ label: dayLabel(d), patch: { recurrence: { type: 'once', date: todayKey(d) } } })),
          defaultIndex: 0,
        });
      } else {
        date = first || second;
      }
    }
  }

  return { date, time, period, questions, rest: text };
}

// ---- recurrence helpers ----
function extractRecurrenceOverride(text) {
  let m;
  [m, text] = cut(text, /\b(?:every\s+weekday|(?:on\s+)?weekdays)\b/i);
  if (m) return { recurrence: { type: 'daysOfWeek', daysOfWeek: [1, 2, 3, 4, 5] }, rest: text };
  [m, text] = cut(text, /\b(?:every\s+weekend|(?:on\s+)?weekends)\b/i);
  if (m) return { recurrence: { type: 'daysOfWeek', daysOfWeek: [0, 6] }, rest: text };
  return { recurrence: null, rest: text };
}

const TEMPORAL_LEFTOVER = new RegExp(
  `\\b(today|tonight|tomorrow|yesterday|next|coming|week|weeks|weekend|weekday|weekdays|month|months|morning|afternoon|evening|night|noon|midnight|o'clock|half past|quarter|every|each|daily|weekly|monthly|after|before|until|${DAY_PATTERN}|${MONTH_PATTERN}|am|pm|a\\.m\\.|p\\.m\\.)\\b|\\bat\\s+\\d|\\bin\\s+(?:\\d|an?\\s)|\\d{1,2}[:/]\\d`,
  'i',
);

// Time or date words that were left in the title mean the rules didn't
// understand part of the sentence: a signal to try the on-device model.
export function hasLeftoverTemporalWords(name) {
  return TEMPORAL_LEFTOVER.test(name || '');
}

// ---- assembling a draft ----
function singular(name) {
  const words = name.split(' ');
  const last = words.pop() || '';
  const single = /ies$/i.test(last) ? last.replace(/ies$/i, 'y') : (/[^s]s$/i.test(last) ? last.slice(0, -1) : last);
  return [...words, single].join(' ');
}

function resolveTime({ voiceTime, dateInfo, period }) {
  if (dateInfo.time) return { hour: dateInfo.time.hour, minute: dateInfo.time.minute };
  const periodWord = period || dateInfo.period;
  if (voiceTime && voiceTime.vague && voiceTime.matchedText && periodWord) {
    // "at 8 in the evening": the period settles am/pm.
    const hour12 = voiceTime.hour % 12;
    const hour = periodWord === 'morning' ? hour12 : hour12 + 12;
    return { hour, minute: voiceTime.minute };
  }
  if (voiceTime && !voiceTime.vague) return { hour: voiceTime.hour, minute: voiceTime.minute };
  if (dateInfo.period && (!voiceTime || !voiceTime.matchedText)) {
    return { hour: PERIOD_HOURS[dateInfo.period], minute: 0, vague: true };
  }
  if (voiceTime) {
    const { hour, minute, vague, matchedText } = voiceTime;
    return { hour, minute, ...(vague ? { vague: true } : {}), ...(matchedText && vague ? { bareHour: true } : {}) };
  }
  return null;
}

// Everything except the title: when, how often, and what to ask.
function buildSchedule({ voice, dateInfo, recurrenceOverride, rawText, now }) {
  const questions = [...dateInfo.questions];
  const today = startOfDay(now);
  const periodInText = (rawText.match(/\b(morning|afternoon|evening|night)\b/i) || [])[1]?.toLowerCase() || null;
  let time = resolveTime({ voiceTime: voice.time, dateInfo, period: periodInText });
  let recurrence = recurrenceOverride || (({ matchedText, ...rest }) => rest)(voice.recurrence);

  const recurringWord = /\b(every|each|weekly|daily|monthly)\b/i.test(rawText)
    || new RegExp(`\\b(${DAY_PATTERN})s\\b`, 'i').test(rawText)
    || Boolean(recurrenceOverride);

  // A single weekday with no "every" is either one occurrence or a weekly repeat.
  if (recurrence.type === 'daysOfWeek' && recurrence.daysOfWeek.length === 1 && !recurringWord && !dateInfo.date) {
    const dow = recurrence.daysOfWeek[0];
    const nameOfDay = `${DAY_NAMES[dow][0].toUpperCase()}${DAY_NAMES[dow].slice(1)}`;
    const timeAhead = time && startOfDay(now).getTime() === nextWeekday(today, dow, true).getTime()
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), time.hour, time.minute) > now
      : true;
    const once = nextWeekday(today, dow, timeAhead);
    questions.push({
      id: 'weekday_repeat',
      kind: 'choice',
      message: `Just this ${nameOfDay}, or every ${nameOfDay}?`,
      options: [
        { label: `Just ${dayLabel(once)}`, patch: { recurrence: { type: 'once', date: todayKey(once) } } },
        { label: `Every ${nameOfDay}`, patch: { recurrence } },
      ],
      defaultIndex: 0,
    });
    recurrence = { type: 'once', date: todayKey(once) };
  }

  if (dateInfo.date) {
    const asOnce = { type: 'once', date: todayKey(dateInfo.date) };
    if (recurrence.type !== 'once') {
      // "every Friday tomorrow": two instructions that disagree.
      questions.push({
        id: 'conflict',
        kind: 'choice',
        message: 'You gave a date and a repeat. Which one?',
        options: [
          { label: 'Keep repeating', patch: { recurrence } },
          { label: `Just ${dayLabel(dateInfo.date)}`, patch: { recurrence: asOnce } },
        ],
        defaultIndex: 0,
      });
    } else {
      recurrence = asOnce;
    }
  }

  // "at 8" with no am/pm: ask, and let the answer decide the date too, so
  // "8 PM today" and "8 AM tomorrow" are the two real choices once 8 AM has gone by.
  if (time && time.bareHour) {
    const hour12 = time.hour % 12;
    const candidates = [{ hour: hour12, minute: time.minute }, { hour: hour12 + 12, minute: time.minute }];
    const dateIsOpen = recurrence.type === 'once' && (!recurrence.date || recurrence.date === todayKey(today));
    const occurrence = t => {
      const base = dateIsOpen ? today : new Date(`${recurrence.date}T00:00:00`);
      let at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), t.hour, t.minute);
      if (dateIsOpen && at <= now) at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, t.hour, t.minute);
      return at;
    };
    const options = candidates.map(t => {
      const day = occurrence(t);
      const patch = { time: { hour: t.hour, minute: t.minute } };
      if (dateIsOpen) patch.recurrence = { type: 'once', date: todayKey(day) };
      const suffix = dateIsOpen && todayKey(day) !== todayKey(today) ? ' tomorrow' : '';
      return { label: `${formatClock(t)}${suffix}`, patch };
    });
    // Soonest upcoming when the date is open; otherwise 7-11 reads as morning and 1-6 as afternoon/evening.
    const defaultIndex = dateIsOpen
      ? (occurrence(candidates[0]) <= occurrence(candidates[1]) ? 0 : 1)
      : (hour12 >= 7 ? 0 : 1); // 7-11 reads as morning; 12 and 1-6 as midday, afternoon or evening
    questions.push({ id: 'ampm', kind: 'choice', message: 'AM or PM?', options, defaultIndex });
    time = options[defaultIndex].patch.time;
    if (options[defaultIndex].patch.recurrence) recurrence = options[defaultIndex].patch.recurrence;
  }

  // A one-time reminder with no date: today, unless that time has gone by.
  if (recurrence.type === 'once' && !recurrence.date) {
    recurrence = { type: 'once', date: todayKey(today) };
  }
  if (recurrence.type === 'once' && recurrence.date === todayKey(today) && time) {
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), time.hour, time.minute);
    if (at <= now) {
      const tomorrow = addDays(today, 1);
      questions.push({
        id: 'past_time',
        kind: 'choice',
        message: `${formatClock(time)} has already passed today. When should it go off?`,
        options: [
          { label: `Tomorrow, ${formatClock(time)}`, patch: { recurrence: { type: 'once', date: todayKey(tomorrow) } } },
          { label: 'Today anyway', patch: { recurrence: { type: 'once', date: todayKey(today) } } },
        ],
        defaultIndex: 0,
      });
      recurrence = { type: 'once', date: todayKey(tomorrow) };
    }
  }

  if (!time) {
    questions.push({ id: 'time', kind: 'input', message: 'What time should it go off?', field: 'time' });
  } else if (time.vague) {
    questions.push({
      id: 'time_guess',
      kind: 'choice',
      message: `Guessed ${formatClock(time)}. Is that right?`,
      options: [{ label: `Keep ${formatClock(time)}`, patch: {} }],
      defaultIndex: 0,
    });
    time = { hour: time.hour, minute: time.minute };
  }

  return { time, recurrence, questions };
}

// ---- public API ----

// Deterministic parse. Never throws on odd input; unusable text gives a draft
// with questions. -> { name, time, recurrence, count, countMode, questions, source }
export function parseReminderRequest(rawText, now = new Date()) {
  const text = typeof rawText === 'string' ? rawText.slice(0, MAX_REQUEST_LENGTH) : '';
  const prepared = normalizeRequest(text);
  const counted = extractCount(prepared);
  const afterOverride = extractRecurrenceOverride(counted.text);
  const dateInfo = extractDateInfo(afterOverride.rest, now);
  const voice = parseVoiceInput(dateInfo.rest);
  const schedule = buildSchedule({ voice, dateInfo, recurrenceOverride: afterOverride.recurrence, rawText: prepared, now });

  const questions = [];
  // "Add 4 push-ups to tomorrow at 7 am" leaves "push-ups to" once the schedule words are gone.
  const name = voice.name.replace(/\s+(?:to|for|by|until|before|after)$/i, '');
  if (!name) questions.push({ id: 'name', kind: 'input', message: 'What should the reminder say?', field: 'name' });
  else if (hasLeftoverTemporalWords(name)) {
    questions.push({
      id: 'title_words',
      kind: 'input',
      message: "Some words in the title look like a date or time that couldn't be read. Check the title, and set the date and time yourself.",
      field: 'name',
    });
  }
  questions.push(...schedule.questions);

  if (counted.count > 1) {
    questions.push({
      id: 'count',
      kind: 'choice',
      message: `Make ${counted.count} separate reminders, or one reminder with ${counted.count} steps?`,
      options: [
        { label: `${counted.count} reminders`, patch: { countMode: 'separate' } },
        { label: `1 reminder, ${counted.count} steps`, patch: { countMode: 'steps' } },
      ],
      defaultIndex: 0,
    });
  }

  return {
    name,
    time: schedule.time,
    recurrence: schedule.recurrence,
    count: counted.count,
    countMode: counted.count > 1 ? 'separate' : null,
    questions,
    source: 'rules',
  };
}

// Applies the user's answer to a question: returns a new draft with the
// chosen option's patch merged in and the question removed.
export function applyAnswer(draft, questionId, optionIndex) {
  const question = draft.questions.find(q => q.id === questionId);
  const option = question?.options?.[optionIndex];
  if (!option) return draft;
  const { time, recurrence, countMode, name } = option.patch;
  return {
    ...draft,
    ...(name !== undefined ? { name } : {}),
    ...(time ? { time } : {}),
    ...(recurrence ? { recurrence } : {}),
    ...(countMode ? { countMode } : {}),
    questions: draft.questions.filter(q => q.id !== questionId),
  };
}

// True when the rules left the title empty or left time/date words in it:
// the cue to ask the on-device model to split the sentence.
export function needsInterpretation(draft) {
  return !draft.name || hasLeftoverTemporalWords(draft.name);
}

// ---- Model-assisted path ----
// The on-device model only *splits* the sentence into the title and the
// date/time/repeat words, copied as spoken. Each piece is checked against
// what the user actually said, then parsed by the same rules above, so the
// model can't invent a date, time or title word.

const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const wordsOf = s => norm(s).replace(/[^\p{L}\p{N}' ]/gu, ' ').split(' ').filter(Boolean);

export function sanitizeParts(parts, original) {
  const said = norm(original);
  const saidWords = new Set(wordsOf(original));
  const fragment = value => {
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    return text && said.includes(norm(text)) ? text : '';
  };
  let title = typeof parts?.title === 'string' ? parts.title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!title || !wordsOf(title).every(w => saidWords.has(w))) title = '';
  return {
    title: title ? title.charAt(0).toUpperCase() + title.slice(1) : '',
    dateText: fragment(parts?.dateText),
    timeText: fragment(parts?.timeText),
    repeatText: fragment(parts?.repeatText),
  };
}

// -> a draft built from the model's pieces (source: 'ai'), or null if the
// model gave nothing usable.
export function draftFromParts(parts, original, now = new Date()) {
  const clean = sanitizeParts(parts, original);
  if (!clean.title) return null;
  // The model often returns "eight" or "half past two" without the "at" the rules look for.
  const timeText = clean.timeText && !/^(?:at|around|about|by|@)\b/i.test(clean.timeText) ? `at ${clean.timeText}` : clean.timeText;
  const scheduleText = [clean.repeatText, clean.dateText, timeText].filter(Boolean).join(' ');
  const counted = extractCount(normalizeRequest(scheduleText));
  const afterOverride = extractRecurrenceOverride(counted.text);
  const dateInfo = extractDateInfo(afterOverride.rest, now);
  const voice = parseVoiceInput(dateInfo.rest);
  const schedule = buildSchedule({ voice, dateInfo, recurrenceOverride: afterOverride.recurrence, rawText: scheduleText, now });
  const questions = [...schedule.questions];
  // A date or repeat phrase the rules can't read must not quietly become "today".
  const spoken = clean.dateText || clean.repeatText;
  const readSomething = Boolean(dateInfo.date) || Boolean(afterOverride.recurrence) || voice.recurrence.type !== 'once';
  if (spoken && !readSomething) {
    questions.unshift({
      id: 'date_unreadable',
      kind: 'input',
      message: `Couldn't read "${spoken}" as a date. Please set the date and repeat yourself.`,
      field: 'date',
    });
  }
  return {
    name: clean.title,
    time: schedule.time,
    recurrence: schedule.recurrence,
    count: 1,
    countMode: null,
    questions,
    source: 'ai',
  };
}

// Count of reminders a draft will create once confirmed.
export function reminderCount(draft) {
  return draft.count > 1 && draft.countMode === 'separate' ? draft.count : 1;
}

// Titles for a counted request: "Job application 1", "Job application 2", ...
export function numberedNames(name, count) {
  const base = singular(name);
  return Array.from({ length: count }, (_, i) => `${base} ${i + 1}`);
}

// The draft's time as an <input type="time"> value.
export function timeValue(time) {
  return time ? `${pad2(time.hour)}:${pad2(time.minute)}` : '';
}
