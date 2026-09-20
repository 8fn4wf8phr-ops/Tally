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

// ---- Confetti ----
// Only the big milestones get a burst; the 3/5/7-day nudges stay low-key.
const CONFETTI_MILESTONES = [30, 100, 365];

export function isConfettiMilestone(streak) {
  return CONFETTI_MILESTONES.includes(streak);
}
