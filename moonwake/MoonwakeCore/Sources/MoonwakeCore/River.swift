// River data model (design §4).
//
// Coordinates: `x` is lateral, in points at the 390 pt reference width
// (0 ... 390, left bank side is low x). `y` is along-river distance in points,
// increasing up-river; the craft travels toward +y.

import Foundation

/// A knot of the centerline spline: lateral position `x` at along-river `y`.
public struct SplinePoint: Equatable, Sendable {
    public var y: Double
    public var x: Double
    public init(y: Double, x: Double) { self.y = y; self.x = x }
}

/// An island follows the river's centreline: its lateral centre at any y is
/// `centerline(y) + offsetX`, so the channels beside it stay constant-width
/// around bends. Use `Reach.islandSpan(_:atY:)` for its extent at a given y.
public struct Island: Equatable, Sendable {
    public var yStart: Double
    public var yEnd: Double
    /// Lateral centre at the island's mid-y (convenience for rendering/debug).
    public var centerX: Double
    /// Lateral offset of the island's centre from the river centreline.
    public var offsetX: Double
    public var width: Double
    /// True when the island is longer than a reach (a split, §4).
    public var isSplit: Bool
    /// For a split: which branch is the narrow one holding the Lantern.
    public var narrowBranchOnLeft: Bool?

    public init(yStart: Double, yEnd: Double, centerX: Double, offsetX: Double, width: Double,
                isSplit: Bool = false, narrowBranchOnLeft: Bool? = nil) {
        self.yStart = yStart; self.yEnd = yEnd; self.centerX = centerX; self.offsetX = offsetX; self.width = width
        self.isSplit = isSplit; self.narrowBranchOnLeft = narrowBranchOnLeft
    }

    public var length: Double { yEnd - yStart }
    public var midY: Double { (yStart + yEnd) / 2 }
    public func covers(y: Double) -> Bool { y >= yStart && y <= yEnd }
}

public struct PilingGroup: Equatable, Sendable {
    public var y: Double
    public var xs: [Double]
    public init(y: Double, xs: [Double]) { self.y = y; self.xs = xs }
}

public struct Hazard: Equatable, Identifiable, Sendable {
    public enum Kind: Equatable, Sendable {
        /// Barge. `drift` is 0 when moored, otherwise pt/s across the channel.
        case hulk(drift: Double)
        /// Rotor drone. `dashCadence` is the seconds between sideways dashes.
        case dragonfly(fires: Bool, dashCadence: Double)
        /// Mine chain pivoting about its anchor buoy; `radius` is the cable length.
        case teeth(mineCount: Int, pivotDegPerSec: Double, radius: Double)
    }

    public var id: Int
    public var kind: Kind
    public var x: Double
    public var y: Double

    public init(id: Int, kind: Kind, x: Double, y: Double) {
        self.id = id; self.kind = kind; self.x = x; self.y = y
    }

    /// Lateral half-extent of the part of the hazard that is always lethal.
    /// For Teeth this is the anchor buoy only: the mines sweep a disc and are a
    /// timing problem, not a static wall, so the corridor check treats them as
    /// passable (see RiverGenerator).
    public var footprintHalfWidth: Double {
        switch kind {
        case .hulk: return Tuning.hulkSize.width / 2
        case .dragonfly: return Tuning.dragonflySize / 2
        case .teeth: return Tuning.mineDiameter / 2
        }
    }

    public var footprintHalfLength: Double {
        switch kind {
        case .hulk: return Tuning.hulkSize.length / 2
        case .dragonfly: return Tuning.dragonflySize / 2
        case .teeth: return Tuning.mineDiameter / 2
        }
    }

    public var scoreValue: Int {
        switch kind {
        case .hulk: return Tuning.scoreHulk
        case .dragonfly: return Tuning.scoreDragonfly
        case .teeth(let n, _, _): return Tuning.scoreMine * n + Tuning.scoreChainDetonationBonus
        }
    }
}

public struct Lantern: Equatable, Sendable {
    public var x: Double
    public var y: Double          // centre of the pontoon
    public var length: Double
    public init(x: Double, y: Double, length: Double = Tuning.lanternLength) {
        self.x = x; self.y = y; self.length = length
    }
    public var yStart: Double { y - length / 2 }
    public var yEnd: Double { y + length / 2 }
}

public struct Weir: Equatable, Sendable {
    public var y: Double
    public var spanCenterX: Double
    public var spanWidth: Double
    public init(y: Double, spanCenterX: Double, spanWidth: Double) {
        self.y = y; self.spanCenterX = spanCenterX; self.spanWidth = spanWidth
    }
    public var spanLeftX: Double { spanCenterX - spanWidth / 2 }
    public var spanRightX: Double { spanCenterX + spanWidth / 2 }
}

/// One 600 pt segment of river. Self-contained: it stores the spline knots it
/// needs (including the neighbouring knots on either side) and the islands of
/// the previous reach that extend into it, so geometry queries never need a
/// neighbour.
public struct Reach: Equatable, Sendable {
    public let index: Int
    public let startY: Double
    public let length: Double
    public var endY: Double { startY + length }

    public let centerStart: Double
    public let centerEnd: Double
    public let widthStart: Double
    public let widthEnd: Double

    /// Knots in ascending y: [knot before start, start, (elbow), end, knot after end].
    public let controlPoints: [SplinePoint]

    public let bandIndex: Int          // 1...5
    public let weirsCleared: Int       // Weirs placed before this reach
    public let lighting: LightingState

    public let islands: [Island]
    /// Islands owned by the previous reach that overlap this one (splits).
    public let inheritedIslands: [Island]
    public let pilings: [PilingGroup]
    public let hazards: [Hazard]
    public let lanterns: [Lantern]
    public let weir: Weir?

    /// y of the last Lantern placed up to and including this reach.
    public let lanternCursor: Double
    /// y of the last hazard placed up to and including this reach.
    public let hazardCursor: Double

    public init(index: Int, startY: Double, length: Double,
                centerStart: Double, centerEnd: Double, widthStart: Double, widthEnd: Double,
                controlPoints: [SplinePoint], bandIndex: Int, weirsCleared: Int, lighting: LightingState,
                islands: [Island], inheritedIslands: [Island], pilings: [PilingGroup],
                hazards: [Hazard], lanterns: [Lantern], weir: Weir?,
                lanternCursor: Double, hazardCursor: Double) {
        self.index = index; self.startY = startY; self.length = length
        self.centerStart = centerStart; self.centerEnd = centerEnd
        self.widthStart = widthStart; self.widthEnd = widthEnd
        self.controlPoints = controlPoints
        self.bandIndex = bandIndex; self.weirsCleared = weirsCleared; self.lighting = lighting
        self.islands = islands; self.inheritedIslands = inheritedIslands
        self.pilings = pilings; self.hazards = hazards; self.lanterns = lanterns; self.weir = weir
        self.lanternCursor = lanternCursor; self.hazardCursor = hazardCursor
    }

    public func contains(y: Double) -> Bool { y >= startY && y < endY }

    public var allIslands: [Island] { inheritedIslands + islands }

    // MARK: Geometry

    /// Water width at `y`, smoothstepped from `widthStart` to `widthEnd`.
    public func width(atY y: Double) -> Double {
        let t = RiverMath.clamp((y - startY) / length, 0, 1)
        let s = RiverMath.smoothstep(t)
        let w = widthStart + (widthEnd - widthStart) * s
        return min(w, RiverMath.maxWidth)
    }

    /// Centerline x at `y` from the Catmull-Rom spline through `controlPoints`,
    /// clamped so both banks stay within 6%…94% of the screen.
    public func centerX(atY y: Double) -> Double {
        let raw = RiverMath.catmullRom(controlPoints, atY: y)
        let halfW = width(atY: y) / 2
        return RiverMath.clamp(raw, RiverMath.bankMargin + halfW, Tuning.referenceWidth - RiverMath.bankMargin - halfW)
    }

    public func leftBankX(atY y: Double) -> Double { centerX(atY: y) - width(atY: y) / 2 }
    public func rightBankX(atY y: Double) -> Double { centerX(atY: y) + width(atY: y) / 2 }

    /// Lateral extent of an island at `y` (the island follows the centreline).
    public func islandSpan(_ island: Island, atY y: Double) -> ClosedRange<Double> {
        let c = centerX(atY: y) + island.offsetX
        return (c - island.width / 2)...(c + island.width / 2)
    }

    /// Water intervals at `y`, split around islands, ascending.
    public func channelsAt(y: Double) -> [ClosedRange<Double>] {
        let left = leftBankX(atY: y)
        let right = rightBankX(atY: y)
        var channels: [ClosedRange<Double>] = [left...right]
        for island in allIslands where island.covers(y: y) {
            channels = RiverMath.subtract(channels, islandSpan(island, atY: y))
        }
        return channels
    }
}

/// A contiguous run of reaches starting at index 0; delegates geometry to the
/// reach containing `y`.
public struct River: Sendable {
    public var reaches: [Reach]

    public init(reaches: [Reach]) { self.reaches = reaches }

    public var endY: Double { reaches.last?.endY ?? 0 }

    public func reach(atY y: Double) -> Reach? {
        guard let first = reaches.first else { return nil }
        let i = Int(floor((y - first.startY) / Tuning.reachLength))
        if i < 0 { return first }
        if i >= reaches.count { return reaches.last }
        return reaches[i]
    }

    public func centerX(atY y: Double) -> Double { reach(atY: y)?.centerX(atY: y) ?? Tuning.referenceWidth / 2 }
    public func width(atY y: Double) -> Double { reach(atY: y)?.width(atY: y) ?? Tuning.referenceWidth * Tuning.openingWidth }
    public func leftBankX(atY y: Double) -> Double { centerX(atY: y) - width(atY: y) / 2 }
    public func rightBankX(atY y: Double) -> Double { centerX(atY: y) + width(atY: y) / 2 }
    public func channelsAt(y: Double) -> [ClosedRange<Double>] { reach(atY: y)?.channelsAt(y: y) ?? [] }
    public func islandSpan(_ island: Island, atY y: Double) -> ClosedRange<Double> {
        reach(atY: y)?.islandSpan(island, atY: y) ?? (island.centerX - island.width / 2)...(island.centerX + island.width / 2)
    }
}

// MARK: - Shared maths

public enum RiverMath {
    public static let bankMargin: Double = Tuning.bankMarginFraction * Tuning.referenceWidth              // 23.4
    public static let maxWidth: Double = (1 - 2 * Tuning.bankMarginFraction) * Tuning.referenceWidth     // 343.2

    @inlinable
    public static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        if lo > hi { return (lo + hi) / 2 }
        return min(max(v, lo), hi)
    }

    @inlinable
    public static func smoothstep(_ t: Double) -> Double {
        let c = clamp(t, 0, 1)
        return c * c * (3 - 2 * c)
    }

    /// Uniform Catmull-Rom through `knots` (ascending y), evaluated at `y`.
    /// Outside the knot range the end knots are held.
    public static func catmullRom(_ knots: [SplinePoint], atY y: Double) -> Double {
        guard knots.count >= 2 else { return knots.first?.x ?? Tuning.referenceWidth / 2 }
        if y <= knots[0].y { return knots[0].x }
        if y >= knots[knots.count - 1].y { return knots[knots.count - 1].x }
        var j = 0
        while j + 1 < knots.count - 1 && y > knots[j + 1].y { j += 1 }
        let p1 = knots[j], p2 = knots[j + 1]
        let p0 = j > 0 ? knots[j - 1] : SplinePoint(y: p1.y - (p2.y - p1.y), x: p1.x)
        let p3 = j + 2 < knots.count ? knots[j + 2] : SplinePoint(y: p2.y + (p2.y - p1.y), x: p2.x)
        let span = p2.y - p1.y
        let t = span > 0 ? (y - p1.y) / span : 0
        let t2 = t * t, t3 = t2 * t
        return 0.5 * ((2 * p1.x)
            + (-p0.x + p2.x) * t
            + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
            + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
    }

    /// Removes `cut` from each interval, keeping ascending order.
    public static func subtract(_ intervals: [ClosedRange<Double>], _ cut: ClosedRange<Double>) -> [ClosedRange<Double>] {
        var out: [ClosedRange<Double>] = []
        for iv in intervals {
            if cut.upperBound <= iv.lowerBound || cut.lowerBound >= iv.upperBound {
                out.append(iv)
                continue
            }
            if cut.lowerBound > iv.lowerBound { out.append(iv.lowerBound...cut.lowerBound) }
            if cut.upperBound < iv.upperBound { out.append(cut.upperBound...iv.upperBound) }
        }
        return out
    }

    /// Shrinks every interval by `margin` on both sides and drops the empty ones.
    public static func shrink(_ intervals: [ClosedRange<Double>], by margin: Double) -> [ClosedRange<Double>] {
        intervals.compactMap { iv in
            let lo = iv.lowerBound + margin, hi = iv.upperBound - margin
            return lo <= hi ? lo...hi : nil
        }
    }

    /// Grows every interval by `amount` and merges overlaps.
    public static func grow(_ intervals: [ClosedRange<Double>], by amount: Double) -> [ClosedRange<Double>] {
        let grown = intervals.map { ($0.lowerBound - amount)...($0.upperBound + amount) }.sorted { $0.lowerBound < $1.lowerBound }
        var out: [ClosedRange<Double>] = []
        for iv in grown {
            if let last = out.last, iv.lowerBound <= last.upperBound {
                out[out.count - 1] = last.lowerBound...max(last.upperBound, iv.upperBound)
            } else {
                out.append(iv)
            }
        }
        return out
    }

    /// Intersection of two ascending interval lists.
    public static func intersect(_ a: [ClosedRange<Double>], _ b: [ClosedRange<Double>]) -> [ClosedRange<Double>] {
        var out: [ClosedRange<Double>] = []
        for x in a {
            for y in b {
                let lo = max(x.lowerBound, y.lowerBound), hi = min(x.upperBound, y.upperBound)
                if lo <= hi { out.append(lo...hi) }
            }
        }
        return out.sorted { $0.lowerBound < $1.lowerBound }
    }
}
