import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTitle,
  cleanStepText,
  normalizeSteps,
  validateSteps,
  MAX_TITLE_LENGTH,
  MAX_STEPS,
  MAX_STEP_LENGTH,
} from './validation.js';

test('validateTitle trims and collapses whitespace', () => {
  assert.deepEqual(validateTitle('  Build   my\n portfolio '), { ok: true, title: 'Build my portfolio' });
});

test('validateTitle rejects empty and whitespace-only titles', () => {
  assert.deepEqual(validateTitle(''), { ok: false, code: 'empty_title' });
  assert.deepEqual(validateTitle('   \n\t '), { ok: false, code: 'empty_title' });
});

test('validateTitle rejects non-strings', () => {
  for (const bad of [null, undefined, 42, {}, ['x']]) {
    assert.deepEqual(validateTitle(bad), { ok: false, code: 'invalid_input' });
  }
});

test('validateTitle rejects excessively long input but accepts the maximum', () => {
  assert.equal(validateTitle('a'.repeat(MAX_TITLE_LENGTH + 1)).code, 'title_too_long');
  assert.equal(validateTitle('a'.repeat(MAX_TITLE_LENGTH)).ok, true);
});

test('cleanStepText strips list markers, collapses whitespace and shortens', () => {
  assert.equal(cleanStepText('1. Outline sections'), 'Outline sections');
  assert.equal(cleanStepText('2) Gather   projects'), 'Gather projects');
  assert.equal(cleanStepText('- Build layout'), 'Build layout');
  assert.equal(cleanStepText('• Test it'), 'Test it');
  assert.equal(cleanStepText('x'.repeat(500)).length, MAX_STEP_LENGTH);
  assert.equal(cleanStepText(7), '');
  assert.equal(cleanStepText('   '), '');
});

test('cleanStepText drops trailing periods but keeps other punctuation', () => {
  assert.equal(cleanStepText('Create a website.'), 'Create a website');
  assert.equal(cleanStepText('Wait for it...'), 'Wait for it');
  assert.equal(cleanStepText('Is it done?'), 'Is it done?');
  assert.equal(cleanStepText('v2.0 release'), 'v2.0 release');
  assert.equal(cleanStepText('...'), '');
});

test('cleanStepText keeps text that merely contains digits or hyphens', () => {
  assert.equal(cleanStepText('3D print the part'), '3D print the part');
  assert.equal(cleanStepText('Self-review the draft'), 'Self-review the draft');
});

test('normalizeSteps drops duplicates case-insensitively, keeping the first', () => {
  assert.deepEqual(normalizeSteps(['Test it', 'test it', '  TEST IT ', 'Ship it']), ['Test it', 'Ship it']);
});

test('normalizeSteps drops blanks and non-strings and keeps order', () => {
  assert.deepEqual(normalizeSteps(['B', '', null, 4, 'A', '  ']), ['B', 'A']);
});

test('normalizeSteps caps the count', () => {
  const many = Array.from({ length: 12 }, (_, i) => `Step ${i + 1}`);
  assert.equal(normalizeSteps(many).length, MAX_STEPS);
  assert.equal(normalizeSteps(many)[0], 'Step 1');
});

test('normalizeSteps returns [] for anything that is not an array', () => {
  for (const bad of [null, undefined, 'a, b, c', 5, {}]) assert.deepEqual(normalizeSteps(bad), []);
});

test('validateSteps accepts three to five usable steps', () => {
  assert.deepEqual(validateSteps(['a', 'b', 'c']), { ok: true, steps: ['a', 'b', 'c'] });
  assert.equal(validateSteps(['a', 'b', 'c', 'd', 'e', 'f']).steps.length, MAX_STEPS);
});

test('validateSteps rejects too few steps, including after de-duplication', () => {
  assert.deepEqual(validateSteps(['a', 'b']), { ok: false, code: 'invalid_output' });
  assert.deepEqual(validateSteps(['a', 'A', 'a', 'b']), { ok: false, code: 'invalid_output' });
  assert.deepEqual(validateSteps([]), { ok: false, code: 'invalid_output' });
});

test('validateSteps rejects malformed model output', () => {
  for (const bad of [undefined, null, 'one two three', { steps: ['a', 'b', 'c'] }, 12]) {
    assert.deepEqual(validateSteps(bad), { ok: false, code: 'invalid_output' });
  }
});
