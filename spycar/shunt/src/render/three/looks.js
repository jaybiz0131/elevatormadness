// The three looks (Step 5 fills these in). Stop 3 brightness pass: more exposure and fill, and a view-angle rim on the cars (rim, rimIntensity; carModel.js RIM). Every value here is a render parameter; the sim never reads them. Numbers are documented
// in design/style-guide.md once chosen with ?tune=1.
export const LOOKS = {
  night: { name: 'Night', sky: '#0b1030', horizon: '#3a1a5a', fog: '#241a44', fogDensity: 0.0032, sunColor: '#8fa8ff', sunIntensity: 2.3, sunAzimuth: 200, sunElevation: 58, hemiSky: '#4a5aa0', hemiGround: '#2a2030', hemiIntensity: 1.6, exposure: 1.4, rim: '#7fc8ff', rimIntensity: 0.9,
    bloomThreshold: 0.85, bloomIntensity: 1.1, bloomRadius: 0.7, vignetteOffset: 0.35, vignetteDarkness: 0.55, grain: 0.12, toneMapping: 'agx', msaa: 4, wet: 1.0, neon: 1.0, steam: 0.6, rain: 0, envIntensity: 0.95, lutStrength: 0.8, gradeSat: 1.15, gradeContrast: 1.04, gradeWarm: -0.04, gradeLift: 0.015 },
  dusk: { name: 'Dusk', sky: '#2a2560', horizon: '#ff8a3a', fog: '#6a4a7a', fogDensity: 0.0017, sunColor: '#ffb070', sunIntensity: 2.2, sunAzimuth: 250, sunElevation: 8, hemiSky: '#7a7ac8', hemiGround: '#2a1a20', hemiIntensity: 1.55, exposure: 1.3, rim: '#ffc890', rimIntensity: 0.6,
    bloomThreshold: 0.9, bloomIntensity: 0.8, bloomRadius: 0.6, vignetteOffset: 0.35, vignetteDarkness: 0.45, grain: 0.1, toneMapping: 'agx', msaa: 4, wet: 0.4, neon: 0.5, steam: 0.2, rain: 0, envIntensity: 0.8, lutStrength: 0.7, gradeSat: 1.15, gradeContrast: 1.05, gradeWarm: 0.03, gradeLift: 0.0 },
  bluehour: { name: 'Blue hour', sky: '#0a1a4a', horizon: '#2a4a9a', fog: '#1a2a6a', fogDensity: 0.0018, sunColor: '#6a8aff', sunIntensity: 1.0, sunAzimuth: 250, sunElevation: -4, hemiSky: '#3a5aba', hemiGround: '#182030', hemiIntensity: 1.8, exposure: 1.3, rim: '#a0b8ff', rimIntensity: 0.8,
    bloomThreshold: 0.8, bloomIntensity: 1.3, bloomRadius: 0.75, vignetteOffset: 0.35, vignetteDarkness: 0.5, grain: 0.1, toneMapping: 'agx', msaa: 4, wet: 0.8, neon: 1.0, steam: 0.3, rain: 0, envIntensity: 0.9, lutStrength: 0.7, gradeSat: 1.1, gradeContrast: 1.04, gradeWarm: -0.08, gradeLift: 0.01 },
};
export function lookFor(name) { return LOOKS[name] ? name : 'night'; }
