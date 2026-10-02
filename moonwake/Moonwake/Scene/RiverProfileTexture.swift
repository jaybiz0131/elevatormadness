import SpriteKit

/// Encodes the river's lateral profile into a small RGBA8 texture the water
/// shader samples. One texel per `WaterShader.profileStep` points of river,
/// covering `WaterShader.profileLength` texels, re-encoded as the craft
/// advances (the window slides so world y `baseY` maps to texel 0).
///
/// Row layout (5 rows, symmetric so vertical flip does not matter):
///   0 and 4: tip distance (signed, offset-encoded), xx
///   1 and 3: island centre x, island half width
///   2:       channel centre x, channel half width
/// Each value is 16-bit across two channels: hi, lo.
struct RiverProfileSample {
    var centerX: Float          // reference points
    var halfWidth: Float
    var islandX: Float          // centre of the island at this row (channel centre if none)
    var islandHalfWidth: Float  // 0 if no island
    var tipDist: Float          // >= 0 inside an island's y-range, < 0 beyond its tip (distance), -2048 if none nearby
}

final class RiverProfileTexture {
    let length = WaterShader.profileLength
    let rows = WaterShader.profileRows
    private var bytes: [UInt8]
    private(set) var texture: SKTexture
    /// World y that maps to texel 0.
    private(set) var baseY: Float = 0

    init() {
        bytes = [UInt8](repeating: 0, count: WaterShader.profileLength * WaterShader.profileRows * 4)
        texture = SKTexture(data: Data(bytes), size: CGSize(width: WaterShader.profileLength, height: WaterShader.profileRows))
        texture.filteringMode = .nearest
    }

    /// Rebuilds the whole window from `baseY` using `sample(y)`.
    func rebuild(baseY: Float, sample: (Float) -> RiverProfileSample) {
        self.baseY = baseY
        let step = WaterShader.profileStep
        for i in 0..<length {
            let s = sample(baseY + Float(i) * step)
            put(row: 2, i: i, a: s.centerX / 1024, b: s.halfWidth / 1024)
            put(row: 1, i: i, a: s.islandX / 1024, b: s.islandHalfWidth / 1024)
            put(row: 3, i: i, a: s.islandX / 1024, b: s.islandHalfWidth / 1024)
            let tip = (max(-2048, min(2047, s.tipDist)) + 2048) / 4096
            put(row: 0, i: i, a: tip, b: 0)
            put(row: 4, i: i, a: tip, b: 0)
        }
        texture = SKTexture(data: Data(bytes), size: CGSize(width: length, height: rows))
        texture.filteringMode = .nearest
    }

    private func put(row: Int, i: Int, a: Float, b: Float) {
        let o = (row * length + i) * 4
        let ca = UInt16(max(0, min(65535, (a * 65535).rounded())))
        let cb = UInt16(max(0, min(65535, (b * 65535).rounded())))
        bytes[o + 0] = UInt8(ca >> 8); bytes[o + 1] = UInt8(ca & 0xff)
        bytes[o + 2] = UInt8(cb >> 8); bytes[o + 3] = UInt8(cb & 0xff)
    }
}
