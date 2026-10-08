// Input and output validation for the on-device AI features. Pure and
// dependency-free so it can be tested directly. Model output is untrusted:
// everything the model returns goes through here before it reaches the UI,
// and nothing here ever touches stored reminders.

export const MAX_TITLE_LENGTH = 200;
export const MIN_STEPS = 3;
export const MAX_STEPS = 5;
export const MAX_STEP_LENGTH = 120;
export const MAX_REQUEST_LENGTH = 300;

const LIST_MARKER = /^(?:[-*•]|\d+[.)])\s+/;

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// -> { ok: true, title } | { ok: false, code: 'invalid_input' | 'empty_title' | 'title_too_long' }
export function validateTitle(raw) {
  if (typeof raw !== 'string') return { ok: false, code: 'invalid_input' };
  const title = collapse(raw);
  if (!title) return { ok: false, code: 'empty_title' };
  if (title.length > MAX_TITLE_LENGTH) return { ok: false, code: 'title_too_long' };
  return { ok: true, title };
}

// Cleans one piece of step text: collapses whitespace, strips a leading list
// marker ("1.", "-", "•"), and shortens it. Returns '' for anything unusable.
export function cleanStepText(raw) {
  if (typeof raw !== 'string') return '';
  // The on-device model ends every step with a period; a checklist reads better without.
  let text = collapse(raw).replace(LIST_MARKER, '').replace(/\.+$/, '').trim();
  if (text.length > MAX_STEP_LENGTH) text = text.slice(0, MAX_STEP_LENGTH).trim();
  return text;
}

// Any array-ish input -> clean, de-duplicated (case-insensitive) steps in
// their original order, at most MAX_STEPS. Non-strings and blanks are dropped.
export function normalizeSteps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const steps = [];
  for (const item of raw) {
    const step = cleanStepText(item);
    if (!step) continue;
    const key = step.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push(step);
    if (steps.length === MAX_STEPS) break;
  }
  return steps;
}

// -> { ok: true, steps } | { ok: false, code: 'invalid_output' }
export function validateSteps(raw) {
  const steps = normalizeSteps(raw);
  if (steps.length < MIN_STEPS) return { ok: false, code: 'invalid_output' };
  return { ok: true, steps };
}

// A typed or spoken reminder request.
// -> { ok: true, text } | { ok: false, code: 'invalid_input' | 'empty_request' | 'request_too_long' }
export function validateRequest(raw) {
  if (typeof raw !== 'string') return { ok: false, code: 'invalid_input' };
  const text = collapse(raw);
  if (!text) return { ok: false, code: 'empty_request' };
  if (text.length > MAX_REQUEST_LENGTH) return { ok: false, code: 'request_too_long' };
  return { ok: true, text };
}
