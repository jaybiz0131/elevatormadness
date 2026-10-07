// Player settings, persisted. The sim copies sens and autoDrift into G.cfg at run start.

export const S = { sound: true, music: true, haptics: true, shake: true, motion: false, left: false, sens: 1.0, tapSlam: false, autoDrift: false, debug: false, cam: 'C', gfx: 'auto', gfxAuto: null, fewShots: false, simple: false, camV: 2 };
try { const s = JSON.parse(localStorage.getItem('shunt-settings') || '{}'); Object.assign(S, s); if (s.camV !== 2) { S.cam = 'C'; S.camV = 2; } } catch (e) {}   // driver control: camera C becomes the default once, for everyone
try { if (matchMedia('(prefers-reduced-motion: reduce)').matches && localStorage.getItem('shunt-settings') === null) S.motion = true; } catch (e) {}
export function saveSettings() { try { localStorage.setItem('shunt-settings', JSON.stringify(S)); } catch (e) {} }
