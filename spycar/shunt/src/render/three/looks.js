// The three looks (Step 5 fills these in). Every value here is a render parameter; the sim never reads them. Numbers are documented
// in design/style-guide.md once chosen with ?tune=1.
export const LOOKS = {
  night: { name: 'Night', sky: '#0b1030', horizon: '#3a1a5a', fog: '#241a44', fogDensity: 0.0032, sunColor: '#8fa8ff', sunIntensity: 1.8, sunAzimuth: 210, sunElevation: 38, hemiSky: '#3a4a8a', hemiGround: '#1a1420', hemiIntensity: 1.1, exposure: 1.15,
    bloomThreshold: 0.85, bloomIntensity: 1.1, bloomRadius: 0.7, vignetteOffset: 0.35, vignetteDarkness: 0.55, grain: 0.12, toneMapping: 'agx', msaa: 4, wet: 1.0, neon: 1.0, steam: 0.6, rain: 0, envIntensity: 0.7, lutStrength: 0.8, gradeSat: 1.15, gradeContrast: 1.08, gradeWarm: -0.04, gradeLift: 0.0 },
  dusk: { name: 'Dusk', sky: '#3a2a6a', horizon: '#ff8a3a', fog: '#c0603a', fogDensity: 0.0026, sunColor: '#ffb070', sunIntensity: 3.0, sunAzimuth: 250, sunElevation: 8, hemiSky: '#6a5a9a', hemiGround: '#3a2a20', hemiIntensity: 1.0, exposure: 1.0,
    bloomThreshold: 0.9, bloomIntensity: 0.8, bloomRadius: 0.6, vignetteOffset: 0.35, vignetteDarkness: 0.45, grain: 0.1, toneMapping: 'agx', msaa: 4, wet: 0.4, neon: 0.5, steam: 0.2, rain: 0, envIntensity: 0.8, lutStrength: 0.7, gradeSat: 1.2, gradeContrast: 1.05, gradeWarm: 0.06, gradeLift: 0.0 },
  bluehour: { name: 'Blue hour', sky: '#0a1a4a', horizon: '#2a4a9a', fog: '#1a2a6a', fogDensity: 0.0018, sunColor: '#6a8aff', sunIntensity: 1.0, sunAzimuth: 250, sunElevation: -4, hemiSky: '#3a5aba', hemiGround: '#101828', hemiIntensity: 1.5, exposure: 1.1,
    bloomThreshold: 0.8, bloomIntensity: 1.3, bloomRadius: 0.75, vignetteOffset: 0.35, vignetteDarkness: 0.5, grain: 0.1, toneMapping: 'agx', msaa: 4, wet: 0.8, neon: 1.0, steam: 0.3, rain: 0, envIntensity: 0.9, lutStrength: 0.7, gradeSat: 1.1, gradeContrast: 1.04, gradeWarm: -0.08, gradeLift: 0.01 },
};
export function lookFor(name) { return LOOKS[name] ? name : 'night'; }
