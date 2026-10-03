// Sky, fog, environment and colour grade. A gradient dome (zenith to horizon) follows the camera; height fog tinted to the horizon
// colour is patched into every standard material through the fog shader chunks; a small pre-filtered environment map, built from
// the same gradient, gives the cars and the wet road their reflections; a 16^3 LUT per look does the grade.
import { Mesh, SphereGeometry, ShaderMaterial, BackSide, Color, Vector3, ShaderChunk, PMREMGenerator, Scene, FogExp2 } from 'three';
import { LookupTexture } from 'postprocessing';
// --- height fog: distance fog that thins with height above the road, so the horizon and the far street soak in it while towers rise out
ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG\n varying float vFogDepth; varying float vFogY;\n#endif`;
ShaderChunk.fog_vertex = `#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogY = (modelMatrix * vec4(transformed, 1.0)).y;\n#endif`;
ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying float vFogY;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n#endif`;
ShaderChunk.fog_fragment = `#ifdef USE_FOG\n #ifdef FOG_EXP2\n float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n #else\n float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n #endif\n fogFactor *= exp( - max( 0.0, vFogY ) * 0.045 );\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif`;
const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize; varying vec3 vDir;
void main() { float h = clamp(vDir.y, -0.05, 1.0); float t = pow(1.0 - h, 2.2); vec3 c = mix(zenith, horizon, t); float sd = max(0.0, dot(normalize(vDir), sunDir)); c += sunCol * (pow(sd, 48.0) * 0.6 + pow(sd, 400.0) * sunSize); gl_FragColor = vec4(c, 1.0); }`;
export class Sky {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.mat = new ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { zenith: { value: new Color('#0b1030') }, horizon: { value: new Color('#3a1a5a') }, sunDir: { value: new Vector3(0, 1, 0) }, sunCol: { value: new Color('#000000') }, sunSize: { value: 0 } }, side: BackSide, depthWrite: false, fog: false });
    this.dome = new Mesh(new SphereGeometry(1200, 24, 12), this.mat); this.dome.frustumCulled = false; this.dome.renderOrder = -10; scene.add(this.dome);
    this.pmrem = new PMREMGenerator(renderer); this.envScene = new Scene(); this.envDome = new Mesh(new SphereGeometry(50, 16, 8), this.mat.clone()); this.envScene.add(this.envDome); this.envTarget = null;
    scene.fog = new FogExp2(0x241a44, 0.003);
  }
  apply(P, sunDir) {
    const u = this.mat.uniforms; u.zenith.value.set(P.sky); u.horizon.value.set(P.horizon); u.sunDir.value.copy(sunDir); u.sunCol.value.set(P.sunColor).multiplyScalar(P.sunElevation > 0 ? 1 : 0.35); u.sunSize.value = P.sunElevation > 0 ? 3 : 0;
    this.scene.background = null; this.scene.fog.color.set(P.fog); this.scene.fog.density = P.fogDensity;
    // the environment map: the same gradient, a little brighter, pre-filtered once per look
    const e = this.envDome.material.uniforms; e.zenith.value.copy(u.zenith.value).multiplyScalar(1.4); e.horizon.value.copy(u.horizon.value).multiplyScalar(1.6); e.sunDir.value.copy(sunDir); e.sunCol.value.copy(u.sunCol.value); e.sunSize.value = u.sunSize.value;
    if (this.envTarget) this.envTarget.dispose(); this.envTarget = this.pmrem.fromScene(this.envScene, 0.04); this.scene.environment = this.envTarget.texture; this.scene.environmentIntensity = P.envIntensity || 0.6;
  }
  update(camPos) { this.dome.position.copy(camPos); }
}
// --- colour grade: a small 3D LUT per look, built in place from a few knobs (lift, gamma, gain per channel, saturation)
export function buildLut(grade) {
  const n = 16; const lut = LookupTexture.createNeutral(n); const d = lut.image.data; const { lift = [0, 0, 0], gain = [1, 1, 1], gamma = [1, 1, 1], sat = 1, contrast = 1 } = grade;
  for (let i = 0; i < n * n * n; i++) { const r0 = d[i * 4], g0 = d[i * 4 + 1], b0 = d[i * 4 + 2]; let c = [r0, g0, b0];
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; for (let k = 0; k < 3; k++) { let v = l + (c[k] - l) * sat; v = (v - 0.5) * contrast + 0.5; v = Math.pow(Math.max(0, v), 1 / gamma[k]) * gain[k] + lift[k]; c[k] = Math.min(1, Math.max(0, v)); }
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; }
  // 8-bit: iPhones cannot filter float textures linearly, and a float LUT then samples as black and blacks out the whole frame
  lut.convertToUint8(); lut.needsUpdate = true; return lut;
}
