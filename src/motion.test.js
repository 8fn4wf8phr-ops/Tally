import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RING_GOAL_DAYS,
  ringProgress,
  ringDashOffset,
  staggerDelay,
  LIST_STAGGER_STEP_MS,
  LIST_STAGGER_MAX_DELAY_MS,
  clampSwipe,
  resolveSwipeSnap,
  SWIPE_COMPLETE_THRESHOLD,
  clampCompleteSwipe,
  completeProgress,
  shouldCompleteOnRelease,
  isConfettiMilestone,
} from './motion.js';

test('ringProgress fills toward the goal and caps at 1', () => {
  assert.equal(ringProgress(0), 0);
  assert.equal(ringProgress(15), 0.5);
  assert.equal(ringProgress(RING_GOAL_DAYS), 1);
  assert.equal(ringProgress(RING_GOAL_DAYS + 12), 1);
});

test('ringProgress honors a custom goal and ignores bad input', () => {
  assert.equal(ringProgress(5, 10), 0.5);
  assert.equal(ringProgress(-3), 0);
  assert.equal(ringProgress(undefined), 0);
  assert.equal(ringProgress(5, 0), 0);
});

test('ringDashOffset runs from a full offset (empty) to zero (full)', () => {
  assert.equal(ringDashOffset(0, 100), 100);
  assert.equal(ringDashOffset(0.25, 100), 75);
  assert.equal(ringDashOffset(1, 100), 0);
  assert.equal(ringDashOffset(2, 100), 0);
  assert.equal(ringDashOffset(-1, 100), 100);
});

test('clampSwipe never moves right of closed and resists past open', () => {
  assert.equal(clampSwipe(30), 0);
  assert.equal(clampSwipe(-40), -40);
  assert.equal(clampSwipe(-500), -(84 + 24));
});

test('resolveSwipeSnap opens only past the halfway point', () => {
  assert.equal(resolveSwipeSnap(-10), 'closed');
  assert.equal(resolveSwipeSnap(-42), 'closed');
  assert.equal(resolveSwipeSnap(-43), 'open');
  assert.equal(resolveSwipeSnap(-84), 'open');
});

test('staggerDelay grows with index and caps at the max', () => {
  assert.equal(staggerDelay(0), 0);
  assert.equal(staggerDelay(1), LIST_STAGGER_STEP_MS);
  assert.equal(staggerDelay(3), 3 * LIST_STAGGER_STEP_MS);
  assert.equal(staggerDelay(20), LIST_STAGGER_MAX_DELAY_MS); // would be 900ms uncapped
  assert.equal(staggerDelay(-1), 0);
});

test('clampCompleteSwipe never goes negative or past the row width', () => {
  assert.equal(clampCompleteSwipe(-10, 300), 0);
  assert.equal(clampCompleteSwipe(150, 300), 150);
  assert.equal(clampCompleteSwipe(999, 300), 300);
});

test('clampCompleteSwipe is inert without a real row width', () => {
  assert.equal(clampCompleteSwipe(50, 0), 0);
  assert.equal(clampCompleteSwipe(50, undefined), 0);
});

test('completeProgress runs 0 to 1 across the row width', () => {
  assert.equal(completeProgress(0, 300), 0);
  assert.equal(completeProgress(150, 300), 0.5);
  assert.equal(completeProgress(300, 300), 1);
  assert.equal(completeProgress(999, 300), 1); // clamped, doesn't overshoot
});

test('shouldCompleteOnRelease commits only past the threshold', () => {
  const rowWidth = 300;
  const justUnder = rowWidth * SWIPE_COMPLETE_THRESHOLD - 1;
  const justOver = rowWidth * SWIPE_COMPLETE_THRESHOLD + 1;
  assert.equal(shouldCompleteOnRelease(justUnder, rowWidth), false);
  assert.equal(shouldCompleteOnRelease(justOver, rowWidth), true);
  assert.equal(shouldCompleteOnRelease(rowWidth, rowWidth), true);
});

test('confetti fires only for the 30/100/365-day milestones', () => {
  for (const n of [30, 100, 365]) assert.equal(isConfettiMilestone(n), true);
  for (const n of [3, 5, 7, 29, 31, 0]) assert.equal(isConfettiMilestone(n), false);
});
