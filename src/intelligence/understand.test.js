import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReminderRequest,
  applyAnswer,
  needsInterpretation,
  hasLeftoverTemporalWords,
  sanitizeParts,
  draftFromParts,
  reminderCount,
  numberedNames,
  timeValue,
} from './understand.js';
import { createIntelligence } from './index.js';

// Wednesday, October 7 2026, 10:00 in whatever timezone the test runs in.
const NOW = new Date(2026, 9, 7, 10, 0);
const parse = (text, now = NOW) => parseReminderRequest(text, now);
const ids = draft => draft.questions.map(q => q.id);
const clock = t => (t ? `${t.hour}:${String(t.minute).padStart(2, '0')}` : null);

const ORIGINAL_TZ = process.env.TZ;
after(() => { if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ; });

// ---- the three examples from the brief ----

test('"Remind me to call Marcus tomorrow at 8 PM" is a one-time reminder tomorrow evening', () => {
  const draft = parse('Remind me to call Marcus tomorrow at 8 PM.');
  assert.equal(draft.name, 'Call Marcus');
  assert.equal(clock(draft.time), '20:00');
  assert.deepEqual(draft.recurrence, { type: 'once', date: '2026-10-08' });
  assert.deepEqual(draft.questions, []);
  assert.equal(draft.source, 'rules');
});

test('"Every Friday at 6 PM, remind me to review my budget" repeats weekly', () => {
  const draft = parse('Every Friday at 6 PM, remind me to review my budget.');
  assert.equal(draft.name, 'Review my budget');
  assert.equal(clock(draft.time), '18:00');
  assert.deepEqual(draft.recurrence, { type: 'daysOfWeek', daysOfWeek: [5] });
  assert.deepEqual(draft.questions, []);
});

test('"Add three job applications to tomorrow\'s tasks" asks how to create them and what time', () => {
  const draft = parse("Add three job applications to tomorrow's tasks.");
  assert.equal(draft.name, 'Job applications');
  assert.equal(draft.count, 3);
  assert.deepEqual(draft.recurrence, { type: 'once', date: '2026-10-08' });
  assert.deepEqual(ids(draft), ['time', 'count']);
  assert.equal(draft.countMode, 'separate');
  assert.equal(reminderCount(draft), 3);
  assert.equal(reminderCount(applyAnswer(draft, 'count', 1)), 1);
  assert.deepEqual(numberedNames(draft.name, 3), ['Job application 1', 'Job application 2', 'Job application 3']);
});

// ---- dates ----

test('relative dates: tomorrow, day after tomorrow, in N days/weeks', () => {
  assert.equal(parse('Pay bill day after tomorrow at 9 am').recurrence.date, '2026-10-09');
  assert.equal(parse('Pay bill in 3 days at 9 am').recurrence.date, '2026-10-10');
  assert.equal(parse('Pay bill in 2 weeks at 9 am').recurrence.date, '2026-10-21');
  assert.equal(parse('Pay bill in a week at 9 am').recurrence.date, '2026-10-14');
});

test('relative durations compute an exact time from now', () => {
  const soon = parse('Remind me in 2 hours to check the oven');
  assert.equal(soon.name, 'Check the oven');
  assert.equal(clock(soon.time), '12:00');
  assert.equal(soon.recurrence.date, '2026-10-07');
  assert.deepEqual(soon.questions, []);
  assert.equal(clock(parse('Stretch in 30 minutes').time), '10:30');
  assert.equal(clock(parse('Stretch in an hour').time), '11:00');
});

test('relative durations roll over midnight', () => {
  const late = parse('Check the oven in 2 hours', new Date(2026, 9, 7, 23, 30));
  assert.equal(late.recurrence.date, '2026-10-08');
  assert.equal(clock(late.time), '1:30');
});

test('"tonight" and "tomorrow morning" use a guessed time and say so', () => {
  const tonight = parse('Take medication tonight');
  assert.equal(tonight.name, 'Take medication');
  assert.equal(clock(tonight.time), '21:00');
  assert.equal(tonight.recurrence.date, '2026-10-07');
  assert.deepEqual(ids(tonight), ['time_guess']);
  const morning = parse('Water plants tomorrow morning');
  assert.equal(morning.name, 'Water plants');
  assert.equal(clock(morning.time), '8:00');
  assert.equal(morning.recurrence.date, '2026-10-08');
});

test('an explicit am/pm overrides a period word with no question', () => {
  const draft = parse('Call Sam tomorrow morning at 9:30 am');
  assert.equal(clock(draft.time), '9:30');
  assert.deepEqual(draft.questions, []);
});

test('"at 8 in the evening" is settled by the period', () => {
  const draft = parse('Take medication at 8 in the evening');
  assert.equal(clock(draft.time), '20:00');
  assert.deepEqual(ids(draft), []);
});

test('month names: this year, or next year if the date has passed', () => {
  assert.equal(parse('Dentist on October 20 at 2:15 pm').recurrence.date, '2026-10-20');
  assert.equal(parse('Dentist on 20 October at 2:15 pm').recurrence.date, '2026-10-20');
  assert.equal(parse('Dentist March 3 at 2 pm').recurrence.date, '2027-03-03');
  assert.equal(parse('Dentist on the 5th of November at 2 pm').recurrence.date, '2026-11-05');
  assert.equal(parse('Dentist on Oct 20, 2027 at 2 pm').recurrence.date, '2027-10-20');
});

test('an impossible date is not invented', () => {
  const draft = parse('Dentist on February 30 at 2 pm');
  assert.notEqual(draft.recurrence.date, '2027-03-02');
  assert.notEqual(draft.recurrence.date, '2026-03-02');
});

test('"this Friday" is the coming Friday; "next Friday" asks which', () => {
  assert.equal(parse('Call Sam this Friday at noon').recurrence.date, '2026-10-09');
  const next = parse('Call Sam next Friday at noon');
  assert.deepEqual(ids(next), ['date']);
  assert.equal(next.recurrence.date, '2026-10-09');
  assert.equal(applyAnswer(next, 'date', 1).recurrence.date, '2026-10-16');
  assert.deepEqual(ids(applyAnswer(next, 'date', 1)), []);
});

test('numeric dates ask when month/day is ambiguous and resolve when it is not', () => {
  const ambiguous = parse('Pick up dry cleaning 10/11 at 5pm');
  assert.deepEqual(ids(ambiguous), ['date']);
  assert.equal(ambiguous.recurrence.date, '2026-10-11');
  assert.equal(applyAnswer(ambiguous, 'date', 1).recurrence.date, '2026-11-10');
  assert.deepEqual(ids(parse('Pick up dry cleaning 13/11 at 5pm')), []);
  assert.equal(parse('Pick up dry cleaning 13/11 at 5pm').recurrence.date, '2026-11-13');
  assert.deepEqual(ids(parse('Pick up dry cleaning 11/11 at 5pm')), []);
});

// ---- repeats ----

test('every weekday, weekends, plural weekdays and several days repeat without asking', () => {
  assert.deepEqual(parse('Stretch every weekday at 7 am').recurrence, { type: 'daysOfWeek', daysOfWeek: [1, 2, 3, 4, 5] });
  assert.deepEqual(parse('Hike every weekend at 9 am').recurrence, { type: 'daysOfWeek', daysOfWeek: [0, 6] });
  assert.deepEqual(parse('Take out the trash on Fridays at 7 pm').recurrence, { type: 'daysOfWeek', daysOfWeek: [5] });
  assert.deepEqual(ids(parse('Take out the trash on Fridays at 7 pm')), []);
  assert.deepEqual(parse('Call mom on Sunday and Wednesday at 6 pm').recurrence.daysOfWeek, [0, 3]);
});

test('a lone weekday with no "every" asks: just once, or every week', () => {
  const draft = parse('Call mom on Friday at 6 pm');
  assert.deepEqual(ids(draft), ['weekday_repeat']);
  assert.deepEqual(draft.recurrence, { type: 'once', date: '2026-10-09' });
  assert.deepEqual(applyAnswer(draft, 'weekday_repeat', 1).recurrence, { type: 'daysOfWeek', daysOfWeek: [5] });
});

test('a lone weekday that is today means today only if the time is still ahead', () => {
  assert.equal(parse('Call Sam on Wednesday at 6 pm').recurrence.date, '2026-10-07');
  assert.equal(parse('Call Sam on Wednesday at 9 am').recurrence.date, '2026-10-14');
});

test('monthly and daily repeats are understood', () => {
  assert.deepEqual(parse('Pay rent on the 1st at 9 am').recurrence, { type: 'monthlyDate', dayOfMonth: 1 });
  assert.deepEqual(parse('Take vitamins every day at 8 am').recurrence, { type: 'daily' });
});

test('a date and a repeat that disagree become a question', () => {
  const draft = parse('Call Sam every Friday tomorrow at 5 pm');
  assert.deepEqual(ids(draft), ['conflict']);
  assert.deepEqual(draft.recurrence, { type: 'daysOfWeek', daysOfWeek: [5] });
  assert.deepEqual(applyAnswer(draft, 'conflict', 1).recurrence, { type: 'once', date: '2026-10-08' });
});

// ---- ambiguity and missing information ----

test('a bare hour asks AM or PM, and the answer sets the date too', () => {
  const draft = parse('Take vitamins at 8'); // it is 10:00, so 8 AM means tomorrow
  assert.deepEqual(ids(draft), ['ampm']);
  const [am, pm] = draft.questions[0].options;
  assert.match(am.label, /8:00 AM.*tomorrow/i);
  assert.equal(pm.label, '8:00 PM');
  assert.equal(clock(draft.time), '20:00');
  assert.equal(draft.recurrence.date, '2026-10-07');
  const chosen = applyAnswer(draft, 'ampm', 0);
  assert.equal(clock(chosen.time), '8:00');
  assert.equal(chosen.recurrence.date, '2026-10-08');
  assert.deepEqual(chosen.questions, []);
});

test('a bare hour on a future date picks a sensible default', () => {
  const draft = parse('Take vitamins at 8 tomorrow');
  assert.equal(clock(draft.time), '8:00');
  assert.equal(draft.recurrence.date, '2026-10-08');
  assert.deepEqual(ids(draft), ['ampm']);
  assert.equal(clock(parse('Call at 3 tomorrow').time), '15:00');
});

test('spoken clock phrases are understood', () => {
  assert.equal(clock(parse('Call dentist at half past two tomorrow').time), '14:30');
  assert.equal(clock(parse('Meet at quarter to four tomorrow').time), '15:45');
  assert.equal(clock(parse('Call at quarter to twelve tomorrow').time), '11:45');
  assert.equal(clock(parse("Meet at 5 o'clock tomorrow").time), '17:00');
});

test('a time that already passed today asks, and defaults to tomorrow', () => {
  const draft = parse('Meeting at 9 AM today');
  assert.deepEqual(ids(draft), ['past_time']);
  assert.equal(draft.recurrence.date, '2026-10-08');
  assert.equal(applyAnswer(draft, 'past_time', 1).recurrence.date, '2026-10-07');
});

test('a missing time and a missing title are asked for, not guessed', () => {
  const noTime = parse('Water the plants');
  assert.equal(noTime.time, null);
  assert.deepEqual(ids(noTime), ['time']);
  const nothing = parse('at 8 pm');
  assert.equal(nothing.name, '');
  assert.ok(ids(nothing).includes('name'));
});

test('without a repeat or date, a reminder is one-time today (never silently recurring)', () => {
  assert.deepEqual(parse('Water the plants at 6 pm').recurrence, { type: 'once', date: '2026-10-07' });
});

test('counts are capped and "add a task" is not a count', () => {
  assert.equal(parse('Add 12 push-ups to tomorrow at 7 am').count, 10);
  const single = parse('Add a note about taxes tomorrow at 9 am');
  assert.equal(single.count, 1);
  assert.equal(single.countMode, null);
  assert.equal(parse('Add two stretches tomorrow at 9 am').count, 2);
});

test('"the Monday after next" is the Monday following next Monday', () => {
  const draft = parse('Call the dentist the Monday after next at half past two');
  assert.equal(draft.name, 'Call the dentist');
  assert.equal(draft.recurrence.date, '2026-10-19');
  assert.equal(clock(draft.time), '14:30');
  assert.deepEqual(ids(draft), ['ampm']);
  assert.equal(needsInterpretation(draft), false);
});

test('spelled-out times: "at five thirty", "at eight in the evening", "at ten pm"', () => {
  assert.equal(clock(parse('Drop off the rent at five thirty tomorrow').time), '17:30');
  assert.equal(parse('Drop off the rent at five thirty tomorrow').name, 'Drop off the rent');
  assert.equal(clock(parse('Call Sam at eight in the evening').time), '20:00');
  assert.equal(clock(parse('Call Sam at ten pm').time), '22:00');
  assert.equal(clock(parse('Meet at twelve thirty tomorrow').time), '12:30'); // 12 defaults to midday, not midnight
});

test('"at one point" is not mistaken for a time', () => {
  assert.equal(parse('Look at one point tomorrow').time, null);
});

test('a connector word left behind by the schedule is removed from the title', () => {
  const draft = parse('Add 4 push-ups to tomorrow at 7 am');
  assert.equal(draft.name, 'Push-ups');
  assert.equal(draft.count, 4);
  assert.deepEqual(numberedNames(draft.name, 4), ['Push-up 1', 'Push-up 2', 'Push-up 3', 'Push-up 4']);
  assert.equal(parse('Send the report by tomorrow at 9 am').name, 'Send the report');
});

test('unusable input never throws and always yields questions', () => {
  for (const text of ['', '   ', '???', 'at', 'tomorrow', 'x'.repeat(5000), null, undefined, 42]) {
    const draft = parse(text);
    assert.ok(Array.isArray(draft.questions));
    assert.equal(typeof draft.name, 'string');
  }
  assert.ok(ids(parse('tomorrow')).includes('name'));
});

test('a draft is plain serializable data and never mutated by answering', () => {
  const draft = parse('Take vitamins at 8');
  const snapshot = JSON.stringify(draft);
  assert.equal(JSON.stringify(JSON.parse(snapshot)), snapshot);
  applyAnswer(draft, 'ampm', 0);
  assert.equal(JSON.stringify(draft), snapshot);
  assert.equal(applyAnswer(draft, 'nope', 0), draft);
  assert.equal(applyAnswer(draft, 'time', 0), draft);
});

test('timeValue formats for a time input', () => {
  assert.equal(timeValue({ hour: 8, minute: 5 }), '08:05');
  assert.equal(timeValue(null), '');
});

// ---- timezones ----

for (const zone of ['Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
  test(`"tomorrow" means the local tomorrow in ${zone}, even just before midnight`, () => {
    process.env.TZ = zone;
    const late = new Date(2026, 9, 7, 23, 30);
    const draft = parseReminderRequest('Call Marcus tomorrow at 8 PM', late);
    assert.deepEqual(draft.recurrence, { type: 'once', date: '2026-10-08' });
    const soon = parseReminderRequest('Check the oven in 2 hours', late);
    assert.equal(soon.recurrence.date, '2026-10-08');
    assert.equal(clock(soon.time), '1:30');
  });
}

test('date arithmetic is calendar-based across a daylight-saving change', () => {
  process.env.TZ = 'America/New_York';
  const beforeFallBack = new Date(2026, 10, 1, 10, 0); // DST ends Nov 1 2026
  assert.equal(parseReminderRequest('Call Sam tomorrow at 9 am', beforeFallBack).recurrence.date, '2026-11-02');
  assert.equal(parseReminderRequest('Call Sam in 7 days at 9 am', new Date(2026, 9, 28, 10, 0)).recurrence.date, '2026-11-04');
  const beforeSpringForward = new Date(2026, 2, 7, 22, 0); // DST starts Mar 8 2026
  assert.equal(parseReminderRequest('Call Sam tomorrow at 9 am', beforeSpringForward).recurrence.date, '2026-03-08');
  assert.equal(parseReminderRequest('Call Sam day after tomorrow at 9 am', beforeSpringForward).recurrence.date, '2026-03-09');
});

// ---- when the model is consulted ----

test('ordinary sentences never need the model; leftover time words do', () => {
  assert.equal(needsInterpretation(parse('Remind me to call Marcus tomorrow at 8 PM')), false);
  assert.equal(needsInterpretation(parse('Every Friday at 6 PM, remind me to review my budget')), false);
  assert.equal(needsInterpretation(parse('Water the plants')), false);
  assert.equal(needsInterpretation(parse('Ping Dana right after my standup ends on the last working day of the month')), true);
  assert.equal(needsInterpretation(parse('at 8 pm')), true);
  assert.equal(hasLeftoverTemporalWords('Call the dentist'), false);
  assert.equal(hasLeftoverTemporalWords('Call the dentist after lunch every other week'), true);
});

// ---- the model's pieces are checked against what was said ----

test('sanitizeParts keeps only text the user actually said', () => {
  const said = 'Call the dentist the Monday after next at half past two';
  const clean = sanitizeParts({
    title: 'call the dentist',
    dateText: 'the Monday after next',
    timeText: 'at half past two',
    repeatText: 'every Tuesday',            // never said
  }, said);
  assert.deepEqual(clean, { title: 'Call the dentist', dateText: 'the Monday after next', timeText: 'at half past two', repeatText: '' });
});

test('sanitizeParts rejects a title that adds or changes words', () => {
  assert.equal(sanitizeParts({ title: 'Phone Dr. Smith about the invoice' }, 'Call the dentist').title, '');
  assert.equal(sanitizeParts({ title: 42 }, 'Call the dentist').title, '');
  assert.equal(sanitizeParts(null, 'Call the dentist').title, '');
});

test('draftFromParts runs the model\'s date/time/repeat words through the same rules', () => {
  const said = 'Remind me to call Marcus tomorrow evening at eight';
  const draft = draftFromParts({ title: 'call Marcus', dateText: 'tomorrow evening', timeText: 'at eight', repeatText: '' }, said, NOW);
  assert.equal(draft.source, 'ai');
  assert.equal(draft.name, 'Call Marcus');
  assert.equal(draft.recurrence.date, '2026-10-08');
});

test('draftFromParts accepts a time phrase the model returned without "at"', () => {
  const said = 'Call the dentist the Monday after next at half past two';
  const draft = draftFromParts({ title: 'Call the dentist', dateText: 'the Monday after next', timeText: 'half past two', repeatText: '' }, said, NOW);
  assert.equal(clock(draft.time), '14:30');
  assert.equal(draft.recurrence.date, '2026-10-19');
});

test('draftFromParts gives up when the title is unusable', () => {
  assert.equal(draftFromParts({ title: '', dateText: 'tomorrow' }, 'Call tomorrow', NOW), null);
  assert.equal(draftFromParts({ title: 'Totally different words' }, 'Call tomorrow', NOW), null);
});

test('a date phrase the rules cannot read becomes a question, never a silent "today"', () => {
  const said = 'Ping Dana right after my standup ends on the last working day of the month';
  const draft = draftFromParts({ title: 'Ping Dana', dateText: 'on the last working day of the month', timeText: '', repeatText: '' }, said, NOW);
  assert.equal(draft.name, 'Ping Dana');
  assert.ok(ids(draft).includes('date_unreadable'));
  assert.match(draft.questions[0].message, /last working day of the month/);
  assert.equal(draft.questions[0].kind, 'input');
});

test('a readable model date raises no "unreadable" question', () => {
  const draft = draftFromParts({ title: 'Call Marcus', dateText: 'tomorrow', timeText: 'at 8 PM', repeatText: '' }, 'Call Marcus tomorrow at 8 PM', NOW);
  assert.ok(!ids(draft).includes('date_unreadable'));
});

test('time-like words left in a rules-only title are flagged for the user to check', () => {
  const draft = parse('Ping Dana right after my standup ends on the last working day of the month');
  assert.ok(ids(draft).includes('title_words'));
  assert.ok(!ids(parse('Call Marcus tomorrow at 8 PM')).includes('title_words'));
});

test('a hallucinated date is dropped, leaving a question instead of a wrong date', () => {
  const draft = draftFromParts({ title: 'Call Marcus', dateText: 'next Tuesday', timeText: 'at 8 PM' }, 'Call Marcus at 8 PM', NOW);
  assert.equal(draft.recurrence.date, '2026-10-07'); // not Tuesday
  assert.equal(clock(draft.time), '20:00');
});

// ---- the orchestrator ----

const AVAILABLE = { available: true, osSupported: true, modelAvailable: true, reason: null };
function fakeNative({ availability = AVAILABLE, interpret } = {}) {
  const calls = { availability: 0, interpret: [], cancel: 0 };
  return {
    calls,
    async availability() { calls.availability++; return availability; },
    async breakDownTask() { throw new Error('not used'); },
    async interpretReminder(text) { calls.interpret.push(text); return interpret ? interpret(text) : {}; },
    async cancel() { calls.cancel++; },
  };
}
const HARD = 'Ping Dana right after my standup ends on the last working day of the month';
const HARD_PARTS = { title: 'Ping Dana', dateText: 'on the last working day of the month', timeText: '', repeatText: '' };

test('a plain sentence is understood by rules alone: the model is never touched', async () => {
  const native = fakeNative({ interpret: async () => { throw new Error('should not be called'); } });
  const result = await createIntelligence({ native }).understandReminder('Remind me to call Marcus tomorrow at 8 PM', NOW);
  assert.equal(result.status, 'ok');
  assert.equal(result.usedAI, false);
  assert.equal(result.draft.name, 'Call Marcus');
  assert.equal(native.calls.interpret.length, 0);
  assert.equal(native.calls.availability, 0);
});

test('a hard sentence is split by the model and parsed by the rules', async () => {
  const native = fakeNative({ interpret: async () => HARD_PARTS });
  const result = await createIntelligence({ native }).understandReminder(HARD, NOW);
  assert.equal(result.usedAI, true);
  assert.equal(result.draft.source, 'ai');
  assert.equal(result.draft.name, 'Ping Dana');
  assert.deepEqual(native.calls.interpret, [HARD]);
});

test('model unavailable: the rules draft is returned, with no nagging note', async () => {
  for (const reason of ['os_unsupported', 'device_not_eligible', 'apple_intelligence_not_enabled', 'model_not_ready']) {
    const native = fakeNative({ availability: { available: false, osSupported: true, modelAvailable: false, reason } });
    const result = await createIntelligence({ native }).understandReminder(HARD, NOW);
    assert.equal(result.status, 'ok');
    assert.equal(result.usedAI, false);
    assert.equal(result.note, null);
    assert.equal(native.calls.interpret.length, 0);
  }
});

test('model failure: the rules draft is returned with an honest note', async () => {
  const native = fakeNative({ interpret: async () => { throw Object.assign(new Error('x'), { code: 'declined' }); } });
  const result = await createIntelligence({ native }).understandReminder(HARD, NOW);
  assert.equal(result.status, 'ok');
  assert.equal(result.usedAI, false);
  assert.match(result.note, /Please check the details/);
});

test('a model answer that invents words is ignored in favour of the rules draft', async () => {
  const native = fakeNative({ interpret: async () => ({ title: 'Book a flight to Paris', dateText: '', timeText: '', repeatText: '' }) });
  const result = await createIntelligence({ native }).understandReminder(HARD, NOW);
  assert.equal(result.usedAI, false);
  assert.equal(result.draft.source, 'rules');
  assert.ok(result.note);
});

test('empty and over-long requests are rejected before anything runs', async () => {
  const native = fakeNative();
  const intelligence = createIntelligence({ native });
  assert.equal((await intelligence.understandReminder('   ', NOW)).code, 'empty_request');
  assert.equal((await intelligence.understandReminder('x'.repeat(301), NOW)).code, 'request_too_long');
  assert.equal((await intelligence.understandReminder(null, NOW)).code, 'invalid_input');
  assert.equal(native.calls.availability, 0);
});

test('cancelling while the model works discards its answer', async () => {
  let release;
  const native = fakeNative({ interpret: () => new Promise(resolve => { release = () => resolve(HARD_PARTS); }) });
  const intelligence = createIntelligence({ native });
  const pending = intelligence.understandReminder(HARD, NOW);
  await new Promise(r => setImmediate(r));
  intelligence.cancel();
  release();
  assert.deepEqual(await pending, { status: 'cancelled' });
  assert.equal(intelligence.isBusy, false);
});

test('while the model is busy, a hard sentence still gets the rules draft', async () => {
  let release;
  const native = fakeNative({ interpret: () => new Promise(resolve => { release = () => resolve(HARD_PARTS); }) });
  const intelligence = createIntelligence({ native });
  const first = intelligence.understandReminder(HARD, NOW);
  await new Promise(r => setImmediate(r));
  const second = await intelligence.understandReminder(HARD, NOW);
  assert.equal(second.usedAI, false);
  release();
  assert.equal((await first).usedAI, true);
  assert.equal(native.calls.interpret.length, 1);
});
