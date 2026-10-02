import CoreGraphics

/// The locked top-down three-quarter camera, shared by the water shader and
/// every sprite. World space: x lateral in points at the reference width,
/// y along the river, increasing up-river. Screen space: SpriteKit points
/// with the origin at the bottom-left of the scene.
///
/// `perspY` compresses extra river into the top of the screen; `perspX`
/// converges lateral positions toward the centre with distance. Must match
/// PERSP_Y / PERSP_X in the water shader.
struct Projection {
    static let perspY: CGFloat = 0.45
    static let perspX: CGFloat = 0.12
    /// Craft lane: fraction of screen height from the bottom (design: 70% from the top).
    static let craftLane: CGFloat = 0.30

    var screen: CGSize
    /// World y at the bottom edge of the screen.
    var scroll: CGFloat
    /// Scale from reference-width points (390) to this screen's points.
    var lateralScale: CGFloat { screen.width / 390 }

    /// World y ahead of the bottom edge for a screen fraction v (0 bottom...1 top).
    func worldAhead(v: CGFloat) -> CGFloat { v * screen.height * (1 + Projection.perspY * v) }

    /// Inverse of worldAhead.
    func v(forAhead ahead: CGFloat) -> CGFloat {
        let a = Projection.perspY * screen.height, b = screen.height, c = -ahead
        let disc = max(0, b * b - 4 * a * c)      // far below the screen bottom: clamp instead of NaN
        return (-b + disc.squareRoot()) / (2 * a)
    }

    /// World y of the craft lane.
    var craftWorldY: CGFloat { scroll + worldAhead(v: Projection.craftLane) }

    /// World (x in reference points, y) to scene position and a sprite scale.
    func project(x: CGFloat, y: CGFloat) -> (point: CGPoint, scale: CGFloat, v: CGFloat) {
        let v = self.v(forAhead: y - scroll)
        let ls = 1 - Projection.perspX * v
        let cx = screen.width / 2
        let sx = cx + (x * lateralScale - cx) * ls
        let sy = v * screen.height
        // Sprites shrink with distance in proportion to how much river each screen point covers.
        let scale = ls / (1 + 2 * Projection.perspY * v) * (1 + 2 * Projection.perspY * Projection.craftLane) / (1 - Projection.perspX * Projection.craftLane)
        return (CGPoint(x: sx, y: sy), scale * lateralScale, v)
    }
}
