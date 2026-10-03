// One merged post pass (pmndrs postprocessing): HDR bloom for emissive surfaces, lights and sparks; tone mapping (AgX by default,
// ACES to compare); a vignette; faint grain; chromatic aberration only near top speed. MSAA 4x on the composer's frame buffer.
import { HalfFloatType, UnsignedByteType, Vector2 } from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect, ChromaticAberrationEffect, BlendFunction, LUT3DEffect, KernelSize, LookupTexture } from 'postprocessing';
// The frame buffer is probed before use: iOS Safari can refuse a multisampled half-float target, which shows as a black frame.
// Order tried: HDR + MSAA, HDR, 8-bit + MSAA, 8-bit. `config` says which one the device accepted.
function probe(renderer, composer) { try { const gl = renderer.getContext(); renderer.setRenderTarget(composer.inputBuffer); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR; renderer.setRenderTarget(null); return ok; } catch (e) { try { renderer.setRenderTarget(null); } catch (e2) {} return false; } }
export function createPost(renderer, scene, camera, P) {
  const tries = [{ type: HalfFloatType, ms: P.msaa, name: 'HDR MSAA' + P.msaa }, { type: HalfFloatType, ms: 0, name: 'HDR' }, { type: UnsignedByteType, ms: P.msaa, name: '8-bit MSAA' + P.msaa }, { type: UnsignedByteType, ms: 0, name: '8-bit' }];
  let composer = null, config = 'none';
  for (const t of tries) { const c = new EffectComposer(renderer, { multisampling: t.ms, frameBufferType: t.type }); if (probe(renderer, c)) { composer = c; config = t.name; break; } c.dispose(); }
  if (!composer) { composer = new EffectComposer(renderer, { multisampling: 0, frameBufferType: UnsignedByteType }); config = '8-bit (unprobed)'; }
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ luminanceThreshold: P.bloomThreshold, luminanceSmoothing: 0.2, intensity: P.bloomIntensity, mipmapBlur: true, radius: P.bloomRadius, kernelSize: KernelSize.LARGE });
  const tone = new ToneMappingEffect({ mode: P.toneMapping === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.AGX });
  const vignette = new VignetteEffect({ offset: P.vignetteOffset, darkness: P.vignetteDarkness });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true }); noise.blendMode.opacity.value = P.grain;
  const chroma = new ChromaticAberrationEffect({ offset: new Vector2(0, 0), radialModulation: true, modulationOffset: 0.4 });
  const lut = new LUT3DEffect(LookupTexture.createNeutral(16)); lut.blendMode.opacity.value = 0;
  const effects = [bloom, chroma, tone, lut, vignette, noise];
  const pass = new EffectPass(camera, ...effects); composer.addPass(pass);
  return { composer, bloom, tone, vignette, noise, chroma, pass, config,
    setChroma(k) { chroma.offset.set(0.0012 * k, 0.0012 * k); },
    setLut(tex, strength) { const old = lut.lut; lut.lut = tex; lut.blendMode.opacity.value = strength; if (old && old !== tex) old.dispose(); },
    apply(P) { bloom.luminanceMaterial.threshold = P.bloomThreshold; bloom.intensity = P.bloomIntensity; vignette.offset = P.vignetteOffset; vignette.darkness = P.vignetteDarkness; noise.blendMode.opacity.value = P.grain; tone.mode = P.toneMapping === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.AGX; renderer.toneMappingExposure = P.exposure; },
    dispose() { composer.dispose(); } };
}
