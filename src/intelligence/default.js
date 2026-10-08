// The app's real intelligence instance, wired to the native TallyAI plugin.
// Kept apart from index.js so that module (and its tests) never import Capacitor.
import { registerPlugin } from '@capacitor/core';
import { createNativeAI } from './native-ai.js';
import { createIntelligence } from './index.js';

export const intelligence = createIntelligence({ native: createNativeAI(registerPlugin('TallyAI')) });
