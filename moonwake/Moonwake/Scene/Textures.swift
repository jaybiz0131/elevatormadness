import SpriteKit
import UIKit

/// Small procedurally generated textures: a soft radial glow and a hard dot.
/// Everything in v1 that is not the water shader is drawn from these and
/// shape nodes; real sprites replace them in the art pass.
enum Textures {
    static let glow: SKTexture = radial(size: 64, hard: false)
    static let dot: SKTexture = radial(size: 16, hard: true)

    private static func radial(size: Int, hard: Bool) -> SKTexture {
        let s = CGFloat(size)
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: s, height: s))
        let image = renderer.image { ctx in
            let c = ctx.cgContext
            let colors: [CGColor]
            let locations: [CGFloat]
            if hard {
                colors = [UIColor.white.cgColor, UIColor.white.cgColor, UIColor.white.withAlphaComponent(0).cgColor]
                locations = [0, 0.7, 1]
            } else {
                colors = [UIColor.white.cgColor, UIColor.white.withAlphaComponent(0.35).cgColor, UIColor.white.withAlphaComponent(0).cgColor]
                locations = [0, 0.35, 1]
            }
            let space = CGColorSpaceCreateDeviceRGB()
            if let g = CGGradient(colorsSpace: space, colors: colors as CFArray, locations: locations) {
                c.drawRadialGradient(g, startCenter: CGPoint(x: s / 2, y: s / 2), startRadius: 0,
                                     endCenter: CGPoint(x: s / 2, y: s / 2), endRadius: s / 2, options: [])
            }
        }
        let t = SKTexture(image: image)
        t.filteringMode = .linear
        return t
    }

    /// Additive glow sprite.
    static func glowSprite(radius: CGFloat, color: UIColor, alpha: CGFloat) -> SKSpriteNode {
        let n = SKSpriteNode(texture: glow, size: CGSize(width: radius * 2, height: radius * 2))
        n.color = color
        n.colorBlendFactor = 1
        n.alpha = alpha
        n.blendMode = .add
        return n
    }
}
