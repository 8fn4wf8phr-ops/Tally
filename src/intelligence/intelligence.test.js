import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createIntelligence } from './index.js';
import { createNativeAI } from './native-ai.js';
import { unavailableMessage, errorMessage } from './fallback.js';

const AVAILABLE = { available: true, osSupported: true, modelAvailable: true, reason: null };

// A controllable stand-in for the native side.
function fakeNative({ availability = AVAILABLE, breakDown } = {}) {
  const calls = { breakDown: [], cancel: 0, availability: 0 };
  return {
    calls,
    async availability() { calls.availability++; return availability; },
    async breakDownTask(title) {
      calls.breakDown.push(title);
      return breakDown ? breakDown(title) : { steps: ['Outline', 'Draft', 'Review'] };
    },
    async cancel() { calls.cancel++; },
  };
}

const withCode = (code, reason) => Object.assign(new Error(code), { code, reason });

test('breakIntoSteps returns validated steps on success', async () => {
  const native = fakeNative({ breakDown: async () => ({ steps: ['1. Outline sections', '2. Gather projects', '3. Build it'] }) });
  const result = await createIntelligence({ native }).breakIntoSteps('  Build my portfolio ');
  assert.deepEqual(result, { status: 'ok', steps: ['Outline sections', 'Gather projects', 'Build it'] });
  assert.deepEqual(native.calls.breakDown, ['Build my portfolio']); // the cleaned title
});

test('an empty title never reaches the native side', async () => {
  const native = fakeNative();
  const result = await createIntelligence({ native }).breakIntoSteps('   ');
  assert.equal(result.status, 'error');
  assert.equal(result.code, 'empty_title');
  assert.equal(native.calls.breakDown.length, 0);
  assert.equal(native.calls.availability, 0);
});

test('an over-long title never reaches the native side', async () => {
  const native = fakeNative();
  const result = await createIntelligence({ native }).breakIntoSteps('x'.repeat(500));
  assert.equal(result.code, 'title_too_long');
  assert.equal(native.calls.breakDown.length, 0);
});

test('unsupported OS, ineligible device and unavailable model are reported, not attempted', async () => {
  for (const reason of ['os_unsupported', 'device_not_eligible', 'apple_intelligence_not_enabled', 'model_not_ready']) {
    const native = fakeNative({ availability: { available: false, osSupported: true, modelAvailable: false, reason } });
    const result = await createIntelligence({ native }).breakIntoSteps('Plan trip');
    assert.deepEqual(result, { status: 'unavailable', reason, message: unavailableMessage(reason) });
    assert.equal(native.calls.breakDown.length, 0);
    assert.match(result.message, /by hand|Try again/); // always points to a way forward
  }
});

test('a missing plugin degrades to unavailable', async () => {
  const plugin = { availability: async () => { throw new Error('not implemented'); } };
  const result = await createIntelligence({ native: createNativeAI(plugin) }).breakIntoSteps('Plan trip');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'plugin_unavailable');
});

test('a plugin that fails mid-request with UNIMPLEMENTED is unavailable, not an error', async () => {
  const plugin = {
    availability: async () => ({ available: true, osSupported: true, modelAvailable: true }),
    breakDownTask: async () => { throw Object.assign(new Error('x'), { code: 'UNIMPLEMENTED' }); },
  };
  const result = await createIntelligence({ native: createNativeAI(plugin) }).breakIntoSteps('Plan trip');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'plugin_unavailable');
});

test('invalid model output is rejected as an error', async () => {
  for (const out of [{ steps: ['only one'] }, { steps: 'not a list' }, {}, null, { steps: ['a', 'A', 'a'] }]) {
    const native = fakeNative({ breakDown: async () => out });
    const result = await createIntelligence({ native }).breakIntoSteps('Plan trip');
    assert.deepEqual(result, { status: 'error', code: 'invalid_output', message: errorMessage('invalid_output') });
  }
});

test('inference failures surface a message and let the user retry', async () => {
  const native = fakeNative({ breakDown: async () => { throw withCode('declined'); } });
  const intelligence = createIntelligence({ native });
  const result = await intelligence.breakIntoSteps('Plan trip');
  assert.equal(result.status, 'error');
  assert.equal(result.code, 'declined');
  assert.equal(intelligence.isBusy, false); // freed, so "Suggest again" works
});

test('an unexpected failure is reported generically', async () => {
  const native = fakeNative({ breakDown: async () => { throw new Error('boom'); } });
  const result = await createIntelligence({ native }).breakIntoSteps('Plan trip');
  assert.equal(result.code, 'inference_failed');
});

test('a native-side "unavailable" rejection carries its reason', async () => {
  const native = fakeNative({ breakDown: async () => { throw withCode('unavailable', 'model_not_ready'); } });
  const result = await createIntelligence({ native }).breakIntoSteps('Plan trip');
  assert.deepEqual(result, { status: 'unavailable', reason: 'model_not_ready', message: unavailableMessage('model_not_ready') });
});

test('a second request while one is running is refused, not queued', async () => {
  let release;
  const native = fakeNative({ breakDown: () => new Promise(resolve => { release = () => resolve({ steps: ['a', 'b', 'c'] }); }) });
  const intelligence = createIntelligence({ native });
  const first = intelligence.breakIntoSteps('First');
  assert.equal(intelligence.isBusy, true);
  assert.deepEqual(await intelligence.breakIntoSteps('Second'), { status: 'busy' });
  await new Promise(r => setImmediate(r)); // let the first reach the native call
  release();
  assert.equal((await first).status, 'ok');
  assert.equal(native.calls.breakDown.length, 1);
  assert.equal(intelligence.isBusy, false);
});

test('a double-tap in the same tick starts only one request', async () => {
  const native = fakeNative();
  const intelligence = createIntelligence({ native });
  const [a, b] = await Promise.all([intelligence.breakIntoSteps('Plan trip'), intelligence.breakIntoSteps('Plan trip')]);
  assert.deepEqual([a.status, b.status].sort(), ['busy', 'ok']);
  assert.equal(native.calls.breakDown.length, 1);
});

test('cancel stops waiting, tells the native side, and discards a late result', async () => {
  let release;
  const native = fakeNative({ breakDown: () => new Promise(resolve => { release = () => resolve({ steps: ['a', 'b', 'c'] }); }) });
  const intelligence = createIntelligence({ native });
  const pending = intelligence.breakIntoSteps('Plan trip');
  await new Promise(r => setImmediate(r));
  intelligence.cancel();
  assert.equal(native.calls.cancel, 1);
  release(); // the model finishes anyway; the result must not be used
  assert.deepEqual(await pending, { status: 'cancelled' });
  assert.equal(intelligence.isBusy, false);
});

test('a native "cancelled" rejection is reported as cancelled, not an error', async () => {
  const native = fakeNative({ breakDown: async () => { throw withCode('cancelled'); } });
  assert.deepEqual(await createIntelligence({ native }).breakIntoSteps('Plan trip'), { status: 'cancelled' });
});

test('a request started right after a cancel is not blocked, and the old result is still discarded', async () => {
  const releases = [];
  const native = fakeNative({ breakDown: () => new Promise(resolve => releases.push(() => resolve({ steps: ['a', 'b', 'c'] }))) });
  const intelligence = createIntelligence({ native });
  const first = intelligence.breakIntoSteps('One');
  await new Promise(r => setImmediate(r));
  intelligence.cancel();
  assert.equal(intelligence.isBusy, false);
  const second = intelligence.breakIntoSteps('Two');
  await new Promise(r => setImmediate(r));
  releases[0](); releases[1]();
  assert.deepEqual(await first, { status: 'cancelled' });
  assert.equal((await second).status, 'ok');
  assert.equal(intelligence.isBusy, false);
});

test('a native "busy" (still finishing a cancelled request) is reported as busy', async () => {
  const native = fakeNative({ breakDown: async () => { throw withCode('busy'); } });
  assert.deepEqual(await createIntelligence({ native }).breakIntoSteps('Plan trip'), { status: 'busy' });
});

test('cancel with nothing running does nothing', () => {
  const native = fakeNative();
  createIntelligence({ native }).cancel();
  assert.equal(native.calls.cancel, 0);
});

test('a new request can start after a cancelled one', async () => {
  const native = fakeNative();
  const intelligence = createIntelligence({ native });
  const first = intelligence.breakIntoSteps('Plan trip');
  intelligence.cancel();
  await first;
  assert.equal((await intelligence.breakIntoSteps('Plan trip')).status, 'ok');
});

test('native availability is normalised for odd plugin responses', async () => {
  const odd = createNativeAI({ availability: async () => ({ available: 'yes' }) });
  assert.deepEqual(await odd.availability(), { available: false, osSupported: false, modelAvailable: false, reason: 'unknown' });
  const good = createNativeAI({ availability: async () => ({ available: true, osSupported: true, modelAvailable: true }) });
  assert.deepEqual(await good.availability(), { available: true, osSupported: true, modelAvailable: true, reason: null });
});

test('native errors are normalised to { code, reason }', async () => {
  const native = createNativeAI({ breakDownTask: async () => { throw Object.assign(new Error('x'), { code: 'busy', data: { reason: 'r' } }); } });
  await assert.rejects(native.breakDownTask('t'), e => e.code === 'busy' && e.reason === 'r');
});

test('every unavailable reason and error code has a user-facing message', () => {
  for (const reason of ['os_unsupported', 'device_not_eligible', 'apple_intelligence_not_enabled', 'model_not_ready', 'plugin_unavailable', 'unknown', 'never-heard-of-it']) {
    assert.ok(unavailableMessage(reason).length > 10);
  }
  for (const code of ['empty_title', 'title_too_long', 'busy', 'declined', 'too_long', 'unsupported_language', 'rate_limited', 'invalid_output', 'inference_failed', 'nope']) {
    assert.ok(errorMessage(code).length > 10);
  }
});

// Privacy guard: the AI layer must stay offline and must never be able to
// touch stored reminders or schedule notifications.
test('the intelligence layer has no network, storage or notification access', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = [...readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).map(f => path.join(dir, f)), path.join(dir, '..', 'subtasks.js')];
  assert.ok(files.length >= 6);
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /https?:\/\//, /LocalNotifications/, /Preferences/, /localStorage/, /\bBadge\b/];
  for (const file of files) {
    const source = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, ''); // ignore comments
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${path.basename(file)} matches ${pattern}`);
  }
});
