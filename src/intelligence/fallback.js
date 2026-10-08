// What to tell the user when suggested steps aren't available. Every message
// is honest about why and none dead-ends: adding steps by hand always works.

const UNAVAILABLE = {
  os_unsupported: "Suggested steps need iOS 26 or later. You can still add steps by hand.",
  device_not_eligible: "This iPhone doesn't support Apple Intelligence, which suggested steps use. You can still add steps by hand.",
  apple_intelligence_not_enabled: "Turn on Apple Intelligence in Settings to get suggested steps. You can still add steps by hand.",
  model_not_ready: "The on-device model is still getting ready. Try again in a little while, or add steps by hand.",
  plugin_unavailable: "Suggested steps aren't available here. You can still add steps by hand.",
  unknown: "Suggested steps aren't available right now. You can still add steps by hand.",
};

const ERRORS = {
  empty_title: 'Give the reminder a name first.',
  invalid_input: "That title couldn't be used.",
  title_too_long: 'That title is too long to break down. Try a shorter one.',
  busy: 'Already working on steps. One moment.',
  declined: "The on-device model couldn't help with that one. Try rewording it, or add steps by hand.",
  too_long: 'That title is too long to break down. Try a shorter one.',
  unsupported_language: "The on-device model doesn't support this language yet. You can add steps by hand.",
  rate_limited: 'The on-device model is busy. Try again in a moment.',
  invalid_output: "Couldn't come up with useful steps. Try rewording the task, or add steps by hand.",
  inference_failed: "Something went wrong making steps. Try again, or add steps by hand.",
};

export function unavailableMessage(reason) {
  return UNAVAILABLE[reason] || UNAVAILABLE.unknown;
}

export function errorMessage(code) {
  return ERRORS[code] || ERRORS.inference_failed;
}
