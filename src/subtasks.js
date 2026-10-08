// Steps (subtasks) on a reminder, plus the review list shown before any
// suggested steps are saved. Pure and Capacitor-free so it can be tested
// directly.
//
// Data shape (optional, so every existing reminder stays valid as-is):
//   reminder.subtasks = [{ id: number, title: string, done: boolean }]
// Steps have no schedule of their own: nothing here creates or changes a
// notification.

import { cleanStepText, MAX_STEP_LENGTH } from './intelligence/validation.js';

export const MAX_SUBTASKS = 25;

export function getSubtasks(reminder) {
  return Array.isArray(reminder?.subtasks) ? reminder.subtasks : [];
}

// Returns a NEW list: `existing` plus the given titles, cleaned, with blanks
// and case-insensitive duplicates (also against `existing`) skipped, capped at
// MAX_SUBTASKS. Ids continue from the highest existing id.
export function appendSubtasks(existing, titles) {
  const list = Array.isArray(existing) ? existing : [];
  const seen = new Set(list.map(s => s.title.toLowerCase()));
  let nextId = list.reduce((max, s) => Math.max(max, s.id), 0) + 1;
  const result = [...list];
  for (const raw of titles) {
    if (result.length >= MAX_SUBTASKS) break;
    const title = cleanStepText(raw);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    result.push({ id: nextId++, title, done: false });
  }
  return result;
}

export function toggleSubtask(list, id) {
  return list.map(s => (s.id === id ? { ...s, done: !s.done } : s));
}

export function removeSubtask(list, id) {
  return list.filter(s => s.id !== id);
}

export function subtaskProgress(list) {
  return { done: list.filter(s => s.done).length, total: list.length };
}

// ---- Review of suggested steps ----
// Suggestions arrive selected; the user can edit, deselect, or discard each
// one. Only what is still selected and non-empty is ever saved.

export function buildReview(steps) {
  return steps.map((text, i) => ({ id: i + 1, text, selected: true }));
}

export function editReviewItem(items, id, text) {
  return items.map(item => (item.id === id ? { ...item, text: text.slice(0, MAX_STEP_LENGTH) } : item));
}

export function toggleReviewItem(items, id) {
  return items.map(item => (item.id === id ? { ...item, selected: !item.selected } : item));
}

export function discardReviewItem(items, id) {
  return items.filter(item => item.id !== id);
}

export function approvedSteps(items) {
  return items.filter(item => item.selected).map(item => cleanStepText(item.text)).filter(Boolean);
}
