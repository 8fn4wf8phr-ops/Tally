// Thin bridge to the native on-device speech recognition plugin
// (ios/App/App/SpeechInputPlugin.swift). Kept separate from voice.js so the
// pure parsing logic stays importable without a Capacitor runtime.
import { registerPlugin } from '@capacitor/core';

const SpeechInput = registerPlugin('SpeechInput');

// Whether the native plugin is present at all (false in a plain browser
// preview, e.g. `vite dev` outside the Capacitor iOS shell).
export async function isVoiceAvailable() {
  try {
    await SpeechInput.checkPermissions();
    return true;
  } catch {
    return false;
  }
}

// 'granted' | 'denied' | 'prompt'
export async function ensureVoicePermissions() {
  const current = await SpeechInput.checkPermissions();
  if (current.speech === 'granted' && current.microphone === 'granted') {
    return current;
  }
  return SpeechInput.requestPermissions();
}

// Starts on-device speech recognition. `onTranscript` is called with
// { text, isFinal } as results stream in; `onError` with { message }.
// Returns the listener handles so callers can clean them up.
export async function startListening({ onTranscript, onError }) {
  const transcriptListener = await SpeechInput.addListener('transcript', onTranscript);
  const errorListener = await SpeechInput.addListener('error', onError);
  try {
    await SpeechInput.start();
  } catch (e) {
    transcriptListener.remove();
    errorListener.remove();
    throw e;
  }
  return {
    async stop() {
      await SpeechInput.stop();
      transcriptListener.remove();
      errorListener.remove();
    },
  };
}
