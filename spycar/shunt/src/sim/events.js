// The simulation's outbox. Sounds, haptics, callouts and UI changes are events; the main loop delivers them after each step.
import { G } from './state.js';
export function emit(e) { G.ev.push(e); }
export function say(text, sub, ms = 1000, big = false) { emit({ k: 'say', text, sub, ms, big }); }
export function hap(p) { emit({ k: 'buzz', p }); }
export const sfx = new Proxy({}, { get: (_, name) => (...a) => emit({ k: 'sfx', name, a }) });
