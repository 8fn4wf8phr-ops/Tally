// Pure helpers behind the animation pass — free of DOM/Capacitor so the math
// and the "when does this fire" rules can be tested directly (same pattern as
// streak.js / due.js).

// ---- Streak progress ring ----
// The ring fills toward this many days; change it here to re-aim every ring.
export const RING_GOAL_DAYS = 30;

export function ringProgress(streak, goal = RING_GOAL_DAYS) {
  if (!streak || streak < 0 || goal <= 0) return 0;
  return Math.min(streak / goal, 1);
}

// stroke-dashoffset for a circle of the given circumference: full offset is an
// empty ring, zero is a full one.
export function ringDashOffset(progress, circumference) {
  return circumference * (1 - Math.min(Math.max(progress, 0), 1));
}

// ---- Staggered list entrance ----
export const LIST_STAGGER_STEP_MS = 45;
export const LIST_STAGGER_MAX_DELAY_MS = 350;

// Later rows wait a little longer, capped so a long list doesn't make row 20
// wait nearly a second.
export function staggerDelay(index, step = LIST_STAGGER_STEP_MS, max = LIST_STAGGER_MAX_DELAY_MS) {
  return Math.min(Math.max(index, 0) * step, max);
}

// ---- Swipe-to-delete ----
export const SWIPE_ACTION_WIDTH = 84;
const SWIPE_OVERSHOOT = 24;

// Keep a drag between "fully closed" and "a little past open" so the row
// resists instead of flying off. Offsets are <= 0 (leftward).
export function clampSwipe(offset, actionWidth = SWIPE_ACTION_WIDTH) {
  return Math.min(0, Math.max(offset, -(actionWidth + SWIPE_OVERSHOOT)));
}

// On release, snap open once the row has been pulled past halfway.
export function resolveSwipeSnap(offset, actionWidth = SWIPE_ACTION_WIDTH) {
  return offset < -actionWidth / 2 ? 'open' : 'closed';
}

// ---- Swipe-to-complete ----
// Mirrors swipe-to-delete but rightward and unbounded by a fixed action
// width — the reveal is a fraction of the row's own width, not a fixed icon.
export const SWIPE_COMPLETE_THRESHOLD = 0.4;

// Rightward offsets are >= 0, capped at the row's own width (can't drag the
// content further than fully off to the side).
export function clampCompleteSwipe(offset, rowWidth) {
  if (!rowWidth || rowWidth <= 0) return 0;
  return Math.min(Math.max(offset, 0), rowWidth);
}

export function completeProgress(offset, rowWidth) {
  if (!rowWidth || rowWidth <= 0) return 0;
  return Math.min(Math.max(offset / rowWidth, 0), 1);
}

// Past 40% of the row's width, releasing commits to completing it.
export function shouldCompleteOnRelease(offset, rowWidth, threshold = SWIPE_COMPLETE_THRESHOLD) {
  return completeProgress(offset, rowWidth) >= threshold;
}

// ---- Confetti ----
// Only the big milestones get a burst; the 3/5/7-day nudges stay low-key.
const CONFETTI_MILESTONES = [30, 100, 365];

export function isConfettiMilestone(streak) {
  return CONFETTI_MILESTONES.includes(streak);
}
