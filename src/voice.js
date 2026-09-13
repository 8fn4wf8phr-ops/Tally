// Pure voice-transcript parsing logic, kept free of DOM/Capacitor so it can
// be imported directly in tests. Turns a raw speech transcript into a
// best-guess { name, time, recurrence } — always reviewed/edited by the user
// in the add/edit form before anything is saved, so these heuristics don't
// need to be perfect.

export function extractExplicitTime(text) {
  let match = text.match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)/i);
  if (match) {
    let hour = parseInt(match[1]);
    const minute = match[3] ? parseInt(match[3]) : 0;
    const isPM = match[4].toLowerCase() === 'pm';
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    return { hour, minute, matchedText: match[0] };
  }
  if (/\bnoon\b/i.test(text)) return { hour: 12, minute: 0, matchedText: 'noon' };
  if (/\bmidnight\b/i.test(text)) return { hour: 0, minute: 0, matchedText: 'midnight' };
  return null;
}

export function extractDailyPeriodPhrase(text) {
  const match = text.match(/\b(every|in the)\s+(morning|afternoon|evening|night)\b/i);
  if (!match) return null;
  const period = match[2].toLowerCase();
  const hours = { morning: 8, afternoon: 14, evening: 19, night: 21 };
  return {
    matchedText: match[0],
    defaultHour: hours[period],
    impliesDaily: match[1].toLowerCase() === 'every',
  };
}

export function extractRecurrence(text, periodPhrase) {
  const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const foundDays = [], foundNames = [];
  for (const [name, num] of Object.entries(dayMap)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) { foundDays.push(num); foundNames.push(name); }
  }
  if (foundDays.length > 0) return { type: 'daysOfWeek', daysOfWeek: foundDays, matchedText: foundNames };

  if (/\bevery ?day\b|\bdaily\b/i.test(text)) {
    return { type: 'daily', matchedText: [text.match(/every ?day|daily/i)[0]] };
  }
  if (periodPhrase?.impliesDaily) {
    return { type: 'daily', matchedText: [periodPhrase.matchedText] };
  }
  let match = text.match(/on the (\d{1,2})(st|nd|rd|th)/i);
  if (match) return { type: 'monthlyDate', dayOfMonth: parseInt(match[1]), matchedText: [match[0]] };

  return { type: 'once', matchedText: [] };
}

export function extractName(text, explicitTime, periodPhrase, recurrenceMatch) {
  let cleaned = text;
  cleaned = cleaned.replace(/^remind me to\s*/i, '');
  cleaned = cleaned.replace(/^remember to\s*/i, '');

  const phrasesToStrip = [];
  if (explicitTime?.matchedText) phrasesToStrip.push(`at\\s*${explicitTime.matchedText}`, explicitTime.matchedText);
  if (periodPhrase?.matchedText) phrasesToStrip.push(periodPhrase.matchedText);
  if (recurrenceMatch?.matchedText?.length) {
    for (const phrase of recurrenceMatch.matchedText) {
      phrasesToStrip.push(`on (the )?${phrase}`, `every\\s*${phrase}`, phrase);
    }
  }

  for (const phrase of phrasesToStrip) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s*');
    cleaned = cleaned.replace(new RegExp(`\\b${esc}\\b`, 'i'), '');
  }

  cleaned = cleaned.replace(/\b(and|on|at|every)\b/gi, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^\b(and|on|at|,)\b\s*/i, '').replace(/\s*\b(and|on|at|,)\b$/i, '');
  cleaned = cleaned.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseVoiceInput(text) {
  const explicitTime = extractExplicitTime(text);
  const periodPhrase = extractDailyPeriodPhrase(text);
  const recurrence = extractRecurrence(text, periodPhrase);
  const name = extractName(text, explicitTime, periodPhrase, recurrence);
  const time = explicitTime || (periodPhrase ? { hour: periodPhrase.defaultHour, minute: 0, vague: true } : null);
  return { name, time, recurrence };
}
