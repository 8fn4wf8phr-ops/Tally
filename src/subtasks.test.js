import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSubtasks,
  appendSubtasks,
  toggleSubtask,
  removeSubtask,
  subtaskProgress,
  buildReview,
  editReviewItem,
  toggleReviewItem,
  discardReviewItem,
  approvedSteps,
  MAX_SUBTASKS,
} from './subtasks.js';

test('a reminder saved before steps existed has none, without being modified', () => {
  const old = Object.freeze({ id: 1, name: 'Old', time: '09:00', recurrence: { type: 'daily' }, takenDate: null });
  assert.deepEqual(getSubtasks(old), []);
  assert.deepEqual(getSubtasks({ subtasks: 'garbage' }), []);
  assert.deepEqual(getSubtasks(undefined), []);
});

test('appendSubtasks adds cleaned steps with fresh ids, not done', () => {
  assert.deepEqual(appendSubtasks([], ['1. Outline', ' Draft ']), [
    { id: 1, title: 'Outline', done: false },
    { id: 2, title: 'Draft', done: false },
  ]);
});

test('appendSubtasks continues ids and skips duplicates of existing steps', () => {
  const existing = [{ id: 4, title: 'Outline', done: true }];
  const result = appendSubtasks(existing, ['outline', 'Draft']);
  assert.deepEqual(result, [{ id: 4, title: 'Outline', done: true }, { id: 5, title: 'Draft', done: false }]);
});

test('appendSubtasks never mutates its input', () => {
  const existing = Object.freeze([Object.freeze({ id: 1, title: 'A', done: false })]);
  assert.doesNotThrow(() => appendSubtasks(existing, ['B']));
  assert.equal(existing.length, 1);
});

test('appendSubtasks ignores blanks and caps the total', () => {
  assert.deepEqual(appendSubtasks([], ['', '   ', null]), []);
  const many = Array.from({ length: MAX_SUBTASKS + 10 }, (_, i) => `Step ${i}`);
  assert.equal(appendSubtasks([], many).length, MAX_SUBTASKS);
});

test('toggle, remove and progress', () => {
  let list = appendSubtasks([], ['A', 'B', 'C']);
  list = toggleSubtask(list, 2);
  assert.deepEqual(subtaskProgress(list), { done: 1, total: 3 });
  list = toggleSubtask(list, 2);
  assert.deepEqual(subtaskProgress(list), { done: 0, total: 3 });
  list = removeSubtask(list, 1);
  assert.deepEqual(list.map(s => s.title), ['B', 'C']);
  assert.deepEqual(subtaskProgress([]), { done: 0, total: 0 });
});

test('saving steps changes nothing about the reminder or its notification', () => {
  const reminder = { id: 7, name: 'Portfolio', time: '18:00', recurrence: { type: 'daysOfWeek', daysOfWeek: [5] }, color: 'teal', takenDate: null };
  const before = JSON.stringify(reminder);
  const updated = { ...reminder, subtasks: appendSubtasks(getSubtasks(reminder), ['Outline', 'Draft', 'Ship']) };
  const { subtasks, ...rest } = updated;
  assert.equal(JSON.stringify(rest), before); // id, time, recurrence: all untouched
  assert.equal(subtasks.length, 3);
});

// ---- the review the user sees before anything is saved ----

test('suggestions start selected and nothing is saved until approved', () => {
  const review = buildReview(['Outline', 'Draft', 'Ship']);
  assert.deepEqual(review.map(r => r.selected), [true, true, true]);
  assert.deepEqual(approvedSteps(review), ['Outline', 'Draft', 'Ship']);
});

test('rejecting every suggestion leaves nothing to save', () => {
  let review = buildReview(['Outline', 'Draft', 'Ship']);
  for (const item of review) review = toggleReviewItem(review, item.id);
  assert.deepEqual(approvedSteps(review), []);
  assert.deepEqual(approvedSteps([]), []);
});

test('only approved, edited steps are saved', () => {
  let review = buildReview(['Outline', 'Draft', 'Ship']);
  review = toggleReviewItem(review, 2);               // deselect "Draft"
  review = editReviewItem(review, 3, '  Publish it '); // edit "Ship"
  review = discardReviewItem(review, 1);               // discard "Outline"
  assert.deepEqual(approvedSteps(review), ['Publish it']);
});

test('an edit that empties a step drops it from what is saved', () => {
  let review = buildReview(['Outline', 'Draft', 'Ship']);
  review = editReviewItem(review, 1, '   ');
  assert.deepEqual(approvedSteps(review), ['Draft', 'Ship']);
});

test('edited text is limited to the step length', () => {
  const review = editReviewItem(buildReview(['A', 'B', 'C']), 1, 'x'.repeat(400));
  assert.equal(review[0].text.length, 120);
});
