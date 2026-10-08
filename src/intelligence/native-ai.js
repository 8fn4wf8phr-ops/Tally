// Thin wrapper over the native TallyAI Capacitor plugin
// (ios/App/App/TallyAIPlugin.swift). It takes the plugin as an argument and
// imports nothing from Capacitor, so tests can hand it a fake; the real
// plugin is registered in default.js.
//
// Every failure is normalised to { code, reason }. A missing plugin (plain
// browser, or a build without it) is reported as 'plugin_unavailable' rather
// than thrown, so unsupported setups degrade to the normal Tally experience.

function normalizeError(e) {
  const code = e?.code === 'UNIMPLEMENTED' ? 'plugin_unavailable' : (e?.code || 'inference_failed');
  const error = new Error(code);
  error.code = code;
  error.reason = e?.data?.reason || null;
  return error;
}

export function createNativeAI(plugin) {
  return {
    // -> { available, osSupported, modelAvailable, reason }
    async availability() {
      try {
        const result = await plugin.availability();
        const available = result?.available === true;
        return {
          available,
          osSupported: result?.osSupported === true,
          modelAvailable: result?.modelAvailable === true,
          reason: available ? null : (typeof result?.reason === 'string' ? result.reason : 'unknown'),
        };
      } catch {
        return { available: false, osSupported: false, modelAvailable: false, reason: 'plugin_unavailable' };
      }
    },

    // -> { steps: unknown } (unvalidated); rejects with an Error carrying { code, reason }.
    async breakDownTask(title) {
      try {
        return await plugin.breakDownTask({ title });
      } catch (e) {
        throw normalizeError(e);
      }
    },

    async cancel() {
      try {
        await plugin.cancel();
      } catch {
        // Nothing running, or no plugin: either way there's nothing to cancel.
      }
    },
  };
}
