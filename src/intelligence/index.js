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

import { validateTitle, validateSteps, validateRequest } from './validation.js';
import { parseReminderRequest, needsInterpretation, draftFromParts } from './understand.js';
import { unavailableMessage, errorMessage } from './fallback.js';

// Shown when the model was tried but couldn't help; the rules' draft is used.
const MODEL_FALLBACK_NOTE = "The on-device model couldn't read that one, so Tally filled in what it could. Please check the details.";

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

    // Turns a typed or spoken sentence into a draft reminder (never saved here).
    // Rules handle ordinary sentences with no model involved. Only when the
    // rules leave time/date words in the title, or find no title, is the
    // on-device model asked to split the sentence, and its pieces are checked
    // against what was actually said and parsed by the same rules. If the
    // model is unavailable or fails, the rules' draft is returned as it is.
    // -> { status: 'ok', draft, usedAI, note } | { status: 'error', code, message } | { status: 'cancelled' }
    async understandReminder(rawText, now = new Date()) {
      const request = validateRequest(rawText);
      if (!request.ok) return failure(request.code);

      const rulesDraft = parseReminderRequest(request.text, now);
      if (!needsInterpretation(rulesDraft)) return { status: 'ok', draft: rulesDraft, usedAI: false, note: null };
      if (inFlight) return { status: 'ok', draft: rulesDraft, usedAI: false, note: null }; // model busy: rules only

      const job = { cancelled: false };
      inFlight = job;
      try {
        const availability = await native.availability();
        if (job.cancelled) return { status: 'cancelled' };
        if (!availability.available) return { status: 'ok', draft: rulesDraft, usedAI: false, note: null };

        const parts = await native.interpretReminder(request.text);
        if (job.cancelled) return { status: 'cancelled' };
        const aiDraft = draftFromParts(parts, request.text, now);
        if (!aiDraft) return { status: 'ok', draft: rulesDraft, usedAI: false, note: MODEL_FALLBACK_NOTE };
        return { status: 'ok', draft: aiDraft, usedAI: true, note: null };
      } catch (e) {
        if (job.cancelled || e?.code === 'cancelled') return { status: 'cancelled' };
        const quiet = e?.code === 'unavailable' || e?.code === 'plugin_unavailable' || e?.code === 'busy';
        const note = quiet ? null : MODEL_FALLBACK_NOTE;
        return { status: 'ok', draft: rulesDraft, usedAI: false, note };
      } finally {
        if (inFlight === job) inFlight = null;
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
