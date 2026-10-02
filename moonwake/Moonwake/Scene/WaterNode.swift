import SpriteKit

/// Full-screen sprite running the water shader. Owns the river profile
/// texture window and slides it forward as the craft advances.
final class WaterNode: SKSpriteNode {
    let profile = RiverProfileTexture()
    private let waterShader: SKShader
    private var sampler: ((Float) -> RiverProfileSample)?
    /// How far the window extends beyond the current scroll before we rebuild.
    private var windowSpan: Float { Float(WaterShader.profileLength) * WaterShader.profileStep }

    init(size: CGSize) {
        waterShader = SKShader(source: WaterShader.source)
        super.init(texture: nil, color: .black, size: size)
        anchorPoint = CGPoint(x: 0, y: 0)
        position = .zero
        zPosition = -100
        waterShader.setUniform("u_view", SIMD2<Float>(Float(size.width), Float(size.height)))
        waterShader.setUniform("u_scroll", Float(0))
        waterShader.setUniform("u_craft", SIMD2<Float>(195, 0))
        waterShader.setUniform("u_speed", Float(0.5))
        waterShader.setUniform("u_lantern", SIMD2<Float>(-1000, 0))
        waterShader.setUniform("u_profileBase", Float(0))
        waterShader.setUniform("u_profile", texture: profile.texture)
        Lighting.state(.night).apply(to: waterShader)
        shader = waterShader
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func setLighting(_ l: Lighting) { l.apply(to: waterShader) }

    func setSampler(_ s: @escaping (Float) -> RiverProfileSample) {
        sampler = s
        rebuild(from: -600)
    }

    private func rebuild(from base: Float) {
        guard let sampler else { return }
        profile.rebuild(baseY: base, sample: sampler)
        waterShader.setUniform("u_profile", texture: profile.texture)
        waterShader.setUniform("u_profileBase", base)
    }

    /// Per-frame update. `scroll` is the world y at the bottom of the screen.
    func update(scroll: Float, craft: SIMD2<Float>, speedBlend: Float, lantern: SIMD2<Float>?) {
        // Keep the window ahead: rebuild when the visible river nears its end.
        // Visible river spans scroll ... scroll + height * (1 + perspY), ~1.45 screens.
        let needed = scroll + Float(size.height) * 1.6
        if needed > profile.baseY + windowSpan - 200 || scroll < profile.baseY + 100 {
            rebuild(from: scroll - 600)
        }
        waterShader.setUniform("u_scroll", scroll)
        waterShader.setUniform("u_craft", craft)
        waterShader.setUniform("u_speed", speedBlend)
        waterShader.setUniform("u_lantern", lantern ?? SIMD2<Float>(-1000, 0))
    }

    func resize(_ newSize: CGSize) {
        size = newSize
        waterShader.setUniform("u_view", SIMD2<Float>(Float(newSize.width), Float(newSize.height)))
    }
}
