import SpriteKit
import simd

/// The three lighting states from the design document. Same geometry,
/// different shader uniforms and UI tint. Values mirror lookdev/index.html.
struct Lighting {
    enum State { case night, dusk, fog }

    var deep: SIMD3<Float>
    var shallow: SIMD3<Float>
    var sky: SIMD3<Float>
    var moon: SIMD3<Float>
    var moonX: Float          // path column, 0...1 of width
    var pathWidth: Float      // points, at the bottom of the screen
    var specPow: Float
    var specAmt: Float
    var land: SIMD3<Float>
    var landLit: SIMD3<Float>
    var edge: SIMD3<Float>
    var edgePulse: Float
    var fog: SIMD3<Float>
    var fogNear: Float
    var fogAmt: Float
    var lantern: SIMD3<Float>
    var hudColor: UIColor

    static func state(_ s: State) -> Lighting {
        switch s {
        case .night:
            return Lighting(
                deep: [0.015, 0.035, 0.085], shallow: [0.05, 0.16, 0.19], sky: [0.10, 0.16, 0.30],
                moon: [0.85, 0.92, 1.0], moonX: 0.56, pathWidth: 95, specPow: 70, specAmt: 1.0,
                land: [0.035, 0.045, 0.06], landLit: [0.09, 0.11, 0.13], edge: [0.35, 0.95, 1.0], edgePulse: 0,
                fog: [0.03, 0.05, 0.10], fogNear: 0.78, fogAmt: 0,
                lantern: [1.0, 0.62, 0.25], hudColor: UIColor(red: 0.87, green: 0.91, blue: 1.0, alpha: 1))
        case .dusk:
            return Lighting(
                deep: [0.015, 0.04, 0.07], shallow: [0.07, 0.12, 0.11], sky: [0.28, 0.17, 0.22],
                moon: [1.0, 0.66, 0.30], moonX: 0.5, pathWidth: 105, specPow: 50, specAmt: 1.0,
                land: [0.06, 0.04, 0.04], landLit: [0.17, 0.11, 0.08], edge: [1.0, 0.72, 0.45], edgePulse: 0,
                fog: [0.20, 0.11, 0.09], fogNear: 0.78, fogAmt: 0.08,
                lantern: [1.0, 0.65, 0.3], hudColor: UIColor(red: 1.0, green: 0.91, blue: 0.83, alpha: 1))
        case .fog:
            return Lighting(
                deep: [0.07, 0.085, 0.10], shallow: [0.16, 0.18, 0.19], sky: [0.4, 0.43, 0.47],
                moon: [0.8, 0.85, 0.9], moonX: 0.5, pathWidth: 200, specPow: 10, specAmt: 0.35,
                land: [0.05, 0.055, 0.06], landLit: [0.12, 0.13, 0.14], edge: [0.55, 1.0, 1.0], edgePulse: 1,
                fog: [0.42, 0.45, 0.5], fogNear: 0.45, fogAmt: 0.6,
                lantern: [1.0, 0.7, 0.4], hudColor: UIColor(red: 0.93, green: 0.95, blue: 0.96, alpha: 1))
        }
    }

    /// Writes every lighting uniform onto the water shader.
    func apply(to shader: SKShader) {
        shader.setUniform("u_deep", deep)
        shader.setUniform("u_shallow", shallow)
        shader.setUniform("u_sky", sky)
        shader.setUniform("u_moon", moon)
        shader.setUniform("u_moonX", moonX)
        shader.setUniform("u_pathWidth", pathWidth)
        shader.setUniform("u_specPow", specPow)
        shader.setUniform("u_specAmt", specAmt)
        shader.setUniform("u_land", land)
        shader.setUniform("u_landLit", landLit)
        shader.setUniform("u_edge", edge)
        shader.setUniform("u_edgePulse", edgePulse)
        shader.setUniform("u_fog", fog)
        shader.setUniform("u_fogNear", fogNear)
        shader.setUniform("u_fogAmt", fogAmt)
        shader.setUniform("u_lanternCol", lantern)
    }

    /// Linear blend between two states, used for the transition at a band change.
    static func mix(_ a: Lighting, _ b: Lighting, _ t: Float) -> Lighting {
        func m(_ x: SIMD3<Float>, _ y: SIMD3<Float>) -> SIMD3<Float> { x + (y - x) * t }
        func m(_ x: Float, _ y: Float) -> Float { x + (y - x) * t }
        return Lighting(
            deep: m(a.deep, b.deep), shallow: m(a.shallow, b.shallow), sky: m(a.sky, b.sky),
            moon: m(a.moon, b.moon), moonX: m(a.moonX, b.moonX), pathWidth: m(a.pathWidth, b.pathWidth),
            specPow: m(a.specPow, b.specPow), specAmt: m(a.specAmt, b.specAmt),
            land: m(a.land, b.land), landLit: m(a.landLit, b.landLit), edge: m(a.edge, b.edge),
            edgePulse: m(a.edgePulse, b.edgePulse), fog: m(a.fog, b.fog), fogNear: m(a.fogNear, b.fogNear),
            fogAmt: m(a.fogAmt, b.fogAmt), lantern: m(a.lantern, b.lantern),
            hudColor: t < 0.5 ? a.hudColor : b.hudColor)
    }
}

extension SKShader {
    /// Sets (or creates) a uniform by name. SKShader only exposes add/remove,
    /// so look up first to avoid duplicates.
    func setUniform(_ name: String, _ value: Float) {
        if let u = uniformNamed(name) { u.floatValue = value } else { addUniform(SKUniform(name: name, float: value)) }
    }
    func setUniform(_ name: String, _ value: SIMD2<Float>) {
        if let u = uniformNamed(name) { u.vectorFloat2Value = value } else { addUniform(SKUniform(name: name, vectorFloat2: value)) }
    }
    func setUniform(_ name: String, _ value: SIMD3<Float>) {
        if let u = uniformNamed(name) { u.vectorFloat3Value = value } else { addUniform(SKUniform(name: name, vectorFloat3: value)) }
    }
    func setUniform(_ name: String, texture: SKTexture) {
        if let u = uniformNamed(name) { u.textureValue = texture } else { addUniform(SKUniform(name: name, texture: texture)) }
    }
}
