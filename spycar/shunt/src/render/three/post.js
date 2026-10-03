// One merged post pass (pmndrs postprocessing): HDR bloom for emissive surfaces, lights and sparks; tone mapping (AgX by default,
// ACES to compare); a vignette; faint grain; chromatic aberration only near top speed. MSAA 4x on the composer's frame buffer.
import { HalfFloatType, Vector2 } from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect, ChromaticAberrationEffect, BlendFunction, LUT3DEffect, KernelSize, LookupTexture } from 'postprocessing';
export function createPost(renderer, scene, camera, P) {
  const composer = new EffectComposer(renderer, { multisampling: P.msaa, frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ luminanceThreshold: P.bloomThreshold, luminanceSmoothing: 0.2, intensity: P.bloomIntensity, mipmapBlur: true, radius: P.bloomRadius, kernelSize: KernelSize.LARGE });
  const tone = new ToneMappingEffect({ mode: P.toneMapping === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.AGX });
  const vignette = new VignetteEffect({ offset: P.vignetteOffset, darkness: P.vignetteDarkness });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true }); noise.blendMode.opacity.value = P.grain;
  const chroma = new ChromaticAberrationEffect({ offset: new Vector2(0, 0), radialModulation: true, modulationOffset: 0.4 });
  const lut = new LUT3DEffect(LookupTexture.createNeutral(16)); lut.blendMode.opacity.value = 0;
  const effects = [bloom, chroma, tone, lut, vignette, noise];
  const pass = new EffectPass(camera, ...effects); composer.addPass(pass);
  return { composer, bloom, tone, vignette, noise, chroma, pass,
    setChroma(k) { chroma.offset.set(0.0012 * k, 0.0012 * k); },
    setLut(tex, strength) { const old = lut.lut; lut.lut = tex; lut.blendMode.opacity.value = strength; if (old && old !== tex) old.dispose(); },
    apply(P) { bloom.luminanceMaterial.threshold = P.bloomThreshold; bloom.intensity = P.bloomIntensity; vignette.offset = P.vignetteOffset; vignette.darkness = P.vignetteDarkness; noise.blendMode.opacity.value = P.grain; tone.mode = P.toneMapping === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.AGX; renderer.toneMappingExposure = P.exposure; },
    dispose() { composer.dispose(); } };
}
