import SpriteKit

/// Code-drawn placeholder props with the silhouettes from the design
/// document. Each is built at craft-lane scale in scene points; the scene
/// scales them with distance. Replace with sprites in the art pass without
/// changing the scene code: keep the same node names.
enum PropNodes {
    static let hulkSize = CGSize(width: 36, height: 110)
    static let lanternSize = CGSize(width: 20, height: 120)

    static func hulk(lighting: Lighting) -> SKNode {
        let n = SKNode()
        let shadow = SKShapeNode(rectOf: CGSize(width: 40, height: 118))
        shadow.fillColor = UIColor(white: 0, alpha: 0.45); shadow.strokeColor = .clear
        n.addChild(shadow)
        let body = SKShapeNode(rectOf: hulkSize, cornerRadius: 5)
        body.fillColor = UIColor(red: 0.08, green: 0.1, blue: 0.13, alpha: 1)
        body.strokeColor = uiColor(lighting.moon, alpha: 0.35); body.lineWidth = 1
        n.addChild(body)
        let well = SKShapeNode(rectOf: CGSize(width: 26, height: 70))
        well.fillColor = UIColor(red: 0.07, green: 0.086, blue: 0.11, alpha: 1); well.strokeColor = .clear
        well.position = CGPoint(x: 0, y: 11)
        n.addChild(well)
        for i in 0..<4 {
            let slab = SKShapeNode(rectOf: CGSize(width: 26, height: 17.5))
            slab.fillColor = i % 2 == 0 ? UIColor(red: 0.09, green: 0.11, blue: 0.145, alpha: 1) : UIColor(red: 0.05, green: 0.063, blue: 0.086, alpha: 1)
            slab.strokeColor = .clear
            slab.position = CGPoint(x: 0, y: 37 - CGFloat(i) * 17.5)
            n.addChild(slab)
        }
        let house = SKShapeNode(rectOf: CGSize(width: 28, height: 20))
        house.fillColor = UIColor(red: 0.12, green: 0.145, blue: 0.19, alpha: 1); house.strokeColor = .clear
        house.position = CGPoint(x: 0, y: -40)
        n.addChild(house)
        let port = SKShapeNode(rectOf: CGSize(width: 8, height: 5))
        port.fillColor = UIColor(red: 1, green: 0.69, blue: 0.4, alpha: 1); port.strokeColor = .clear
        port.blendMode = .add
        port.position = CGPoint(x: 0, y: -38)
        n.addChild(port)
        let g = Textures.glowSprite(radius: 16, color: UIColor(red: 1, green: 0.6, blue: 0.3, alpha: 1), alpha: 0.7)
        g.position = port.position
        n.addChild(g)
        return n
    }

    static func lantern(lighting: Lighting) -> SKNode {
        let n = SKNode()
        let body = SKShapeNode(rectOf: lanternSize, cornerRadius: 8)
        body.fillColor = UIColor(red: 0.047, green: 0.06, blue: 0.08, alpha: 1)
        body.strokeColor = UIColor(red: 1, green: 0.67, blue: 0.35, alpha: 0.35); body.lineWidth = 1
        n.addChild(body)
        for y in [-40, 0, 40] as [CGFloat] {
            let g = Textures.glowSprite(radius: 26, color: uiColor(lighting.lantern, alpha: 1), alpha: 0.55)
            g.position = CGPoint(x: 0, y: y)
            g.name = "lamp"
            n.addChild(g)
            let dot = SKShapeNode(circleOfRadius: 3.2)
            dot.fillColor = UIColor(red: 1, green: 0.9, blue: 0.7, alpha: 0.95); dot.strokeColor = .clear
            dot.blendMode = .add
            dot.position = g.position
            n.addChild(dot)
        }
        let flicker = SKAction.repeatForever(SKAction.sequence([
            SKAction.fadeAlpha(to: 0.4, duration: 0.11), SKAction.fadeAlpha(to: 0.6, duration: 0.17),
            SKAction.fadeAlpha(to: 0.5, duration: 0.09), SKAction.fadeAlpha(to: 0.62, duration: 0.2)]))
        n.enumerateChildNodes(withName: "lamp") { node, _ in node.run(flicker) }
        return n
    }

    /// One mine of a Teeth chain (the scene positions each mine and the cable).
    static func mine() -> SKNode {
        let n = SKNode()
        let body = SKShapeNode(circleOfRadius: 8)
        body.fillColor = UIColor(red: 0.043, green: 0.055, blue: 0.075, alpha: 1)
        body.strokeColor = UIColor(red: 0.16, green: 0.2, blue: 0.25, alpha: 1); body.lineWidth = 1
        n.addChild(body)
        for a in 0..<6 {
            let ang = CGFloat(a) * .pi / 3
            let spike = SKShapeNode()
            let p = CGMutablePath(); p.move(to: .zero); p.addLine(to: CGPoint(x: cos(ang) * 11, y: sin(ang) * 11))
            spike.path = p; spike.strokeColor = UIColor(red: 0.16, green: 0.2, blue: 0.25, alpha: 1); spike.lineWidth = 2
            spike.zPosition = -0.1
            n.addChild(spike)
        }
        let eye = SKShapeNode(circleOfRadius: 1.8)
        eye.fillColor = UIColor(red: 1, green: 0.27, blue: 0.24, alpha: 1); eye.strokeColor = .clear; eye.blendMode = .add
        eye.run(SKAction.repeatForever(SKAction.sequence([SKAction.fadeAlpha(to: 0.3, duration: 0.5), SKAction.fadeAlpha(to: 1, duration: 0.5)])))
        n.addChild(eye)
        let g = Textures.glowSprite(radius: 10, color: UIColor(red: 1, green: 0.3, blue: 0.25, alpha: 1), alpha: 0.35)
        n.addChild(g)
        return n
    }

    static func anchorBuoy(lighting: Lighting) -> SKNode {
        let b = SKShapeNode(circleOfRadius: 11)
        b.fillColor = UIColor(red: 0.08, green: 0.1, blue: 0.14, alpha: 1)
        b.strokeColor = uiColor(lighting.moon, alpha: 0.5); b.lineWidth = 1.5
        return b
    }

    static func cable(from a: CGPoint, to b: CGPoint) -> SKShapeNode {
        let p = CGMutablePath(); p.move(to: a); p.addLine(to: b)
        let s = SKShapeNode(path: p)
        s.strokeColor = UIColor(red: 0.7, green: 0.86, blue: 1, alpha: 0.35); s.lineWidth = 1
        return s
    }

    static func dragonfly() -> SKNode {
        let n = SKNode()
        let shadow = SKShapeNode(ellipseOf: CGSize(width: 28, height: 12))
        shadow.fillColor = UIColor(white: 0, alpha: 0.35); shadow.strokeColor = .clear
        shadow.position = CGPoint(x: 6, y: -14)
        n.addChild(shadow)
        let body = SKShapeNode(rectOf: CGSize(width: 12, height: 28), cornerRadius: 5)
        body.fillColor = UIColor(red: 0.06, green: 0.07, blue: 0.094, alpha: 1); body.strokeColor = .clear
        n.addChild(body)
        for side in [-1.0, 1.0] as [CGFloat] {
            let ring = SKShapeNode(circleOfRadius: 11)
            ring.strokeColor = UIColor(red: 0.47, green: 1, blue: 0.86, alpha: 0.9); ring.lineWidth = 1.5
            ring.fillColor = UIColor(red: 0.63, green: 0.86, blue: 0.9, alpha: 0.08)
            ring.glowWidth = 3
            ring.blendMode = .add
            ring.position = CGPoint(x: side * 15, y: 0)
            ring.name = "rotor"
            n.addChild(ring)
        }
        let eye = SKShapeNode(circleOfRadius: 1.8)
        eye.fillColor = UIColor(red: 1, green: 0.35, blue: 0.3, alpha: 0.95); eye.strokeColor = .clear; eye.blendMode = .add
        eye.position = CGPoint(x: 0, y: 10)
        eye.name = "eye"
        n.addChild(eye)
        return n
    }

    /// A weir: two wall segments across the river with an open span between.
    /// `left`/`right` are the bank x positions and `spanL`/`spanR` the span edges,
    /// all in scene points relative to the node (y = 0 along the wall).
    static func weir(left: CGFloat, right: CGFloat, spanL: CGFloat, spanR: CGFloat, lighting: Lighting) -> SKNode {
        let n = SKNode()
        let h: CGFloat = 14
        func wall(x0: CGFloat, x1: CGFloat) {
            let w = SKShapeNode(rect: CGRect(x: x0, y: -h / 2, width: x1 - x0, height: h))
            w.fillColor = UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 1); w.strokeColor = .clear
            n.addChild(w)
            let top = SKShapeNode(rect: CGRect(x: x0, y: h / 2 - 1.5, width: x1 - x0, height: 1.5))
            top.fillColor = uiColor(lighting.moon, alpha: 0.22); top.strokeColor = .clear
            n.addChild(top)
            let sh = SKShapeNode(rect: CGRect(x: x0, y: -h / 2 - 5, width: x1 - x0, height: 5))
            sh.fillColor = UIColor(white: 0, alpha: 0.35); sh.strokeColor = .clear
            n.addChild(sh)
        }
        wall(x0: left - 6, x1: spanL)
        wall(x0: spanR, x1: right + 6)
        for px in [spanL, spanR] {
            let post = SKShapeNode(rect: CGRect(x: px - 2.5, y: -h, width: 5, height: h * 2))
            post.fillColor = UIColor(red: 0.047, green: 0.063, blue: 0.086, alpha: 1); post.strokeColor = .clear
            n.addChild(post)
            let lamp = SKShapeNode(circleOfRadius: 2.2)
            lamp.fillColor = UIColor(red: 0.47, green: 1, blue: 0.63, alpha: 0.95); lamp.strokeColor = .clear; lamp.blendMode = .add
            lamp.position = CGPoint(x: px, y: h * 0.9)
            n.addChild(lamp)
            let g = Textures.glowSprite(radius: 16, color: UIColor(red: 0.4, green: 1, blue: 0.6, alpha: 1), alpha: 0.6)
            g.position = lamp.position
            n.addChild(g)
        }
        return n
    }

    static func piling(lighting: Lighting) -> SKNode {
        let n = SKNode()
        let shadow = SKShapeNode(ellipseOf: CGSize(width: 14, height: 8))
        shadow.fillColor = UIColor(white: 0, alpha: 0.4); shadow.strokeColor = .clear
        shadow.position = CGPoint(x: 3, y: -5)
        n.addChild(shadow)
        let post = SKShapeNode(circleOfRadius: 5)
        post.fillColor = UIColor(red: 0.043, green: 0.055, blue: 0.07, alpha: 1); post.strokeColor = .clear
        n.addChild(post)
        let hi = SKShapeNode(circleOfRadius: 2.2)
        hi.fillColor = uiColor(lighting.moon, alpha: 0.35); hi.strokeColor = .clear
        hi.position = CGPoint(x: -1.5, y: 1.5)
        n.addChild(hi)
        return n
    }

    /// Levee lamp on the bank. `side` is -1 for the left bank, +1 for the right.
    static func lamp(side: CGFloat) -> SKNode {
        let n = SKNode()
        let pool = Textures.glowSprite(radius: 30, color: UIColor(red: 1, green: 0.75, blue: 0.45, alpha: 1), alpha: 0.28)
        n.addChild(pool)
        let streak = Textures.glowSprite(radius: 40, color: UIColor(red: 1, green: 0.75, blue: 0.47, alpha: 1), alpha: 0.22)
        streak.xScale = 0.5; streak.yScale = 1.6
        streak.position = CGPoint(x: -side * 18, y: 0)
        n.addChild(streak)
        let bulb = SKShapeNode(circleOfRadius: 1.8)
        bulb.fillColor = UIColor(red: 1, green: 0.88, blue: 0.7, alpha: 0.95); bulb.strokeColor = .clear; bulb.blendMode = .add
        n.addChild(bulb)
        let post = SKShapeNode(rect: CGRect(x: -0.75, y: -9, width: 1.5, height: 7))
        post.fillColor = UIColor(red: 0.04, green: 0.047, blue: 0.063, alpha: 1); post.strokeColor = .clear
        n.addChild(post)
        return n
    }

    static func tracer() -> SKNode {
        let n = SKNode()
        let line = SKShapeNode(rect: CGRect(x: -1, y: -14, width: 2, height: 28), cornerRadius: 1)
        line.fillColor = UIColor(red: 1, green: 0.96, blue: 0.82, alpha: 1); line.strokeColor = .clear; line.blendMode = .add
        n.addChild(line)
        let g = Textures.glowSprite(radius: 8, color: UIColor(red: 1, green: 0.9, blue: 0.6, alpha: 1), alpha: 0.9)
        g.position = CGPoint(x: 0, y: 12)
        n.addChild(g)
        return n
    }

    static func enemyTracer() -> SKNode {
        let n = SKNode()
        let line = SKShapeNode(rect: CGRect(x: -1.2, y: -10, width: 2.4, height: 20), cornerRadius: 1)
        line.fillColor = UIColor(red: 1, green: 0.55, blue: 0.25, alpha: 1); line.strokeColor = .clear; line.blendMode = .add
        n.addChild(line)
        let g = Textures.glowSprite(radius: 7, color: UIColor(red: 1, green: 0.5, blue: 0.2, alpha: 1), alpha: 0.9)
        n.addChild(g)
        return n
    }

    /// Explosion: flash, ring and a burst of sparks, self-removing.
    static func explosion(color: UIColor, big: Bool) -> SKNode {
        let n = SKNode()
        let flash = Textures.glowSprite(radius: big ? 60 : 36, color: color, alpha: 1)
        n.addChild(flash)
        flash.run(SKAction.sequence([SKAction.group([SKAction.scale(to: 1.6, duration: 0.25), SKAction.fadeOut(withDuration: 0.25)]), SKAction.removeFromParent()]))
        let ring = SKShapeNode(circleOfRadius: 6)
        ring.strokeColor = color; ring.lineWidth = 2; ring.fillColor = .clear; ring.blendMode = .add
        n.addChild(ring)
        ring.run(SKAction.sequence([SKAction.group([SKAction.scale(to: big ? 7 : 4.5, duration: 0.35), SKAction.fadeOut(withDuration: 0.35)]), SKAction.removeFromParent()]))
        let em = SKEmitterNode()
        em.particleTexture = Textures.dot
        em.numParticlesToEmit = big ? 90 : 40
        em.particleBirthRate = 2000
        em.particleLifetime = 0.5; em.particleLifetimeRange = 0.3
        em.emissionAngleRange = .pi * 2
        em.particleSpeed = big ? 220 : 150; em.particleSpeedRange = 90
        em.particleScale = 0.18; em.particleScaleSpeed = -0.25
        em.particleAlpha = 1; em.particleAlphaSpeed = -1.8
        em.particleColor = color; em.particleColorBlendFactor = 1
        em.particleBlendMode = .add
        n.addChild(em)
        n.run(SKAction.sequence([SKAction.wait(forDuration: 1.2), SKAction.removeFromParent()]))
        return n
    }

    static func uiColor(_ c: SIMD3<Float>, alpha: CGFloat) -> UIColor {
        UIColor(red: CGFloat(c.x), green: CGFloat(c.y), blue: CGFloat(c.z), alpha: alpha)
    }
}
