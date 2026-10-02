// SplitMix64 — the game's own RNG (design §4: "own implementation ... no
// platform RNG so results match across OS versions").

/// Deterministic 64-bit generator. Value type so a stream can be copied and
/// replayed; `next()` mutates.
public struct SplitMix64: Sendable {
    public var state: UInt64

    public init(seed: UInt64) {
        self.state = seed
    }

    @inlinable
    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Uniform double in [0, 1) built from the top 53 bits.
    @inlinable
    public mutating func nextDouble() -> Double {
        return Double(next() >> 11) * (1.0 / 9_007_199_254_740_992.0)
    }

    /// Uniform double in [lo, hi).
    @inlinable
    public mutating func range(_ lo: Double, _ hi: Double) -> Double {
        return lo + (hi - lo) * nextDouble()
    }

    /// True with probability `p`.
    @inlinable
    public mutating func chance(_ p: Double) -> Bool {
        return nextDouble() < p
    }

    /// Uniform integer in the closed range (inclusive on both ends).
    @inlinable
    public mutating func int(in r: ClosedRange<Int>) -> Int {
        let span = UInt64(r.upperBound - r.lowerBound) + 1
        if span == 0 { return r.lowerBound } // whole Int range; degenerate
        return r.lowerBound + Int(next() % span)
    }

    /// Picks an index given a list of non-negative weights.
    @inlinable
    public mutating func weightedIndex(_ weights: [Double]) -> Int {
        let total = weights.reduce(0, +)
        var roll = nextDouble() * total
        for (i, w) in weights.enumerated() {
            roll -= w
            if roll < 0 { return i }
        }
        return max(0, weights.count - 1)
    }
}

/// Per-reach stream key: `hash(seed, reachIndex)` from §4. A SplitMix64-style
/// finaliser applied to the seed combined with the index so adjacent reaches
/// share nothing.
public func hashReach(seed: UInt64, index: Int) -> UInt64 {
    var z = seed ^ (UInt64(bitPattern: Int64(index)) &* 0x9E37_79B9_7F4A_7C15)
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    z ^= z >> 31
    // One extra round so index 0 does not collapse to the plain seed finaliser.
    z &+= 0x9E37_79B9_7F4A_7C15
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    return z ^ (z >> 31)
}

/// 64-bit FNV-1a over the UTF-8 bytes. Used for the daily seed:
/// `seed = FNV1a("YYYY-MM-DD")`.
public func fnv1a(_ s: String) -> UInt64 {
    var hash: UInt64 = 0xCBF2_9CE4_8422_2325
    for byte in s.utf8 {
        hash ^= UInt64(byte)
        hash &*= 0x0000_0100_0000_01B3
    }
    return hash
}
