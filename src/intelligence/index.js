// Orchestrates on-device AI requests. It validates input, asks the native
// side, validates what comes back, and returns plain data. It never reads or
// writes stored reminders and never schedules notifications: what to do with
// a suggestion is always the user's decision, made in the UI.
//
// Results are one of:
//   { status: 'ok', steps }
//   { status: 'unavailable', reason, message }
//   { status: 'error', code, message }
//   { status: 'busy' | 'cancelled' }

import { validateTitle, validateSteps } from './validation.js';
import { unavailableMessage, errorMessage } from './fallback.js';

export function createIntelligence({ native }) {
  let inFlight = null; // the one request allowed at a time

  const unavailable = (reason) => ({ status: 'unavailable', reason, message: unavailableMessage(reason) });
  const failure = (code) => ({ status: 'error', code, message: errorMessage(code) });

  return {
    get isBusy() {
      return inFlight !== null;
    },

    checkAvailability() {
      return native.availability();
    },

    async breakIntoSteps(rawTitle) {
      const title = validateTitle(rawTitle);
      if (!title.ok) return failure(title.code);
      if (inFlight) return { status: 'busy' };

      const request = { cancelled: false };
      inFlight = request; // claimed before any await, so a double-tap can't start two
      try {
        const availability = await native.availability();
        if (request.cancelled) return { status: 'cancelled' };
        if (!availability.available) return unavailable(availability.reason || 'unknown');

        const raw = await native.breakDownTask(title.title);
        if (request.cancelled) return { status: 'cancelled' };

        const steps = validateSteps(raw?.steps);
        return steps.ok ? { status: 'ok', steps: steps.steps } : failure(steps.code);
      } catch (e) {
        if (request.cancelled || e?.code === 'cancelled') return { status: 'cancelled' };
        if (e?.code === 'busy') return { status: 'busy' }; // the native side is still finishing a cancelled request
        if (e?.code === 'unavailable') return unavailable(e.reason || 'unknown');
        if (e?.code === 'plugin_unavailable') return unavailable('plugin_unavailable');
        return failure(e?.code || 'inference_failed');
      } finally {
        if (inFlight === request) inFlight = null;
      }
    },

    // Stops waiting for the current request and asks the native side to stop.
    // The slot is freed right away so the user can start again; the old
    // request's late result is discarded (it checks its own `cancelled` flag).
    cancel() {
      if (!inFlight) return;
      inFlight.cancelled = true;
      inFlight = null;
      native.cancel();
    },
  };
}
