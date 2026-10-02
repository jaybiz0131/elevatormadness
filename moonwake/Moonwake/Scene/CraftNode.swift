import SpriteKit

/// The Needle. Code-drawn placeholder matching the look-dev silhouette:
/// dark dart hull, moonlit rim, canopy, engine slit, spray emitters.
/// Sized in scene points at craft-lane scale; the scene applies lean.
final class CraftNode: SKNode {
    private let hull = SKShapeNode()
    private let rim = SKShapeNode()
    private let canopy = SKShapeNode()
    private let engine = SKShapeNode(rectOf: CGSize(width: 12, height: 2.5), cornerRadius: 1)
    private let engineGlow = Textures.glowSprite(radius: 22, color: UIColor(red: 0.55, green: 0.8, blue: 1, alpha: 1), alpha: 0.55)
    private let sprayL = SKEmitterNode()
    private let sprayR = SKEmitterNode()
    private var flickerUntil: TimeInterval = 0

    override init() {
        super.init()
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 0, y: 24))
        path.addCurve(to: CGPoint(x: 12, y: -18), control1: CGPoint(x: 9, y: 14), control2: CGPoint(x: 13, y: -2))
        path.addLine(to: CGPoint(x: 7, y: -22))
        path.addLine(to: CGPoint(x: -7, y: -22))
        path.addLine(to: CGPoint(x: -12, y: -18))
        path.addCurve(to: CGPoint(x: 0, y: 24), control1: CGPoint(x: -13, y: -2), control2: CGPoint(x: -9, y: 14))
        path.closeSubpath()

        engineGlow.position = CGPoint(x: 0, y: -20)
        engineGlow.zPosition = -1
        addChild(engineGlow)

        hull.path = path
        hull.fillColor = UIColor(red: 0.05, green: 0.067, blue: 0.094, alpha: 1)
        hull.strokeColor = UIColor(white: 1, alpha: 0.18)
        hull.lineWidth = 0.8
        addChild(hull)

        // rim light: a thin bright stroke on the moon side, faked with a second path offset
        rim.path = path
        rim.fillColor = .clear
        rim.strokeColor = UIColor(red: 0.85, green: 0.92, blue: 1, alpha: 0.45)
        rim.lineWidth = 1.2
        rim.xScale = 0.92
        rim.yScale = 0.96
        rim.position = CGPoint(x: 1.2, y: 0)
        addChild(rim)

        canopy.path = CGPath(ellipseIn: CGRect(x: -4.5, y: -6, width: 9, height: 20), transform: nil)
        canopy.fillColor = UIColor(red: 0.11, green: 0.14, blue: 0.2, alpha: 1)
        canopy.strokeColor = UIColor(red: 0.85, green: 0.92, blue: 1, alpha: 0.35)
        canopy.lineWidth = 0.8
        addChild(canopy)

        engine.fillColor = UIColor(red: 0.6, green: 0.82, blue: 1, alpha: 0.95)
        engine.strokeColor = .clear
        engine.blendMode = .add
        engine.position = CGPoint(x: 0, y: -20)
        addChild(engine)

        for (em, side) in [(sprayL, CGFloat(-1)), (sprayR, CGFloat(1))] {
            em.particleTexture = Textures.dot
            em.particleBirthRate = 60
            em.particleLifetime = 0.45
            em.particleLifetimeRange = 0.2
            em.particlePositionRange = CGVector(dx: 3, dy: 4)
            em.emissionAngle = (side > 0 ? -0.35 : .pi + 0.35) - .pi / 2 * 0.6
            em.emissionAngleRange = 0.5
            em.particleSpeed = 70
            em.particleSpeedRange = 30
            em.particleScale = 0.12
            em.particleScaleRange = 0.06
            em.particleScaleSpeed = 0.15
            em.particleAlpha = 0.6
            em.particleAlphaSpeed = -1.4
            em.particleColor = UIColor(red: 0.8, green: 0.9, blue: 1, alpha: 1)
            em.particleColorBlendFactor = 1
            em.particleBlendMode = .add
            em.position = CGPoint(x: side * 10, y: -2)
            em.zPosition = -0.5
            addChild(em)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    /// Lean with lateral velocity (design: up to ±14°); spray widens with speed.
    func update(lean: CGFloat, speedBlend: CGFloat, now: TimeInterval) {
        zRotation = -lean * (14 * .pi / 180)
        let rate = 40 + 80 * speedBlend
        sprayL.particleBirthRate = rate
        sprayR.particleBirthRate = rate
        engineGlow.alpha = 0.4 + 0.35 * speedBlend
        if now < flickerUntil {
            alpha = (Int(now * 16) % 2 == 0) ? 0.25 : 1
        } else {
            alpha = 1
        }
    }

    /// Damage flicker after a respawn.
    func flicker(until t: TimeInterval) { flickerUntil = t }

    func setVisibleAlive(_ alive: Bool) {
        isHidden = !alive
        sprayL.particleBirthRate = alive ? 60 : 0
        sprayR.particleBirthRate = alive ? 60 : 0
    }
}
