// Seeded river generator (design §4, §5).
//
// Every reach draws from its own SplitMix64 stream `hashReach(seed, index)`.
// Generation of reach i reads the geometry of its neighbours (centre/width
// continuity, lanterns of the next reach for hazard exclusion), so reaches
// are built in order from 0 and cached. Everything is a pure function of the
// seed and the modifier, so any device produces the same river.

import Foundation

public enum DailyModifier: CaseIterable, Equatable, Sendable {
    case narrows      // all widths −12%
    case blackout     // Fog Gray for the whole run
    case thinLanterns // Lantern spacing +25%, fill +20%
    case drift        // Hulks drift from band 1
    case current      // cruise +10%, steer +10%
    case longTeeth    // chains 5–7 from band 1

    /// `seed = FNV1a("YYYY-MM-DD")`, modifier = `seed % 6`.
    public static func forDate(_ yyyymmdd: String) -> (seed: UInt64, modifier: DailyModifier) {
        let seed = fnv1a(yyyymmdd)
        let cases = DailyModifier.allCases
        let index = Int(seed % UInt64(Tuning.dailyModifierCount)) % cases.count
        return (seed, cases[index])
    }

    public var widthScale: Double { self == .narrows ? Tuning.narrowsWidthScale : 1 }
    public var lanternSpacingScale: Double { self == .thinLanterns ? Tuning.thinLanternsSpacingScale : 1 }
    public var fuelFillScale: Double { self == .thinLanterns ? Tuning.thinLanternsFillScale : 1 }
    public var cruiseScale: Double { self == .current ? Tuning.currentCruiseScale : 1 }
    public var steerScale: Double { self == .current ? Tuning.currentSteerScale : 1 }
}

public final class RiverGenerator {
    public let seed: UInt64
    public let modifier: DailyModifier?

    /// Skeleton of a reach: the centreline knots and width, drawn first from the
    /// reach's stream so neighbours can read them without the rest of the reach.
    private struct Skeleton {
        let index: Int
        let startY: Double
        let startCenter: Double
        let startWidth: Double
        let endWidth: Double
        let knots: [SplinePoint]   // interior elbow (bands 4–5) and the end knot
        let bandIndex: Int
        let weirsCleared: Int
        let rng: SplitMix64        // stream state after the skeleton draws
        var endCenter: Double { knots[knots.count - 1].x }
        /// The knot just before the end knot: the elbow if there is one, else the start.
        var knotBeforeEnd: SplinePoint { knots.count >= 2 ? knots[knots.count - 2] : SplinePoint(y: startY, x: startCenter) }
        /// The first knot after the start: the elbow if there is one, else the end.
        var knotAfterStart: SplinePoint { knots[0] }
    }

    /// Everything of a reach except pilings and hazards. Depends only on the
    /// previous prefix, so reach i can read prefix i+1 for lantern exclusions.
    private struct Prefix {
        let geometry: Reach        // contents empty except islands and weir
        let islands: [Island]
        let inheritedIslands: [Island]
        let weir: Weir?
        let lanterns: [Lantern]
        let lanternCursor: Double
        let rng: SplitMix64
    }

    private var skeletons: [Int: Skeleton] = [:]
    private var prefixes: [Int: Prefix] = [:]
    private var reaches: [Int: Reach] = [:]
    private var weirYs: [Double] = []
    private var weirScanY: Double = 0

    public init(seed: UInt64, modifier: DailyModifier? = nil) {
        self.seed = seed
        self.modifier = modifier
    }

    // MARK: Public API

    public func reach(_ index: Int) -> Reach {
        precondition(index >= 0, "reach index must be non-negative")
        if let r = reaches[index] { return r }
        if index > 0 { _ = reach(index - 1) }
        let r = buildReach(index)
        reaches[index] = r
        return r
    }

    /// Reaches 0...index as a `River`.
    public func river(through index: Int) -> River {
        River(reaches: (0...index).map { reach($0) })
    }

    public func startY(ofReach index: Int) -> Double { Double(index) * Tuning.reachLength }

    /// Weirs placed before the start of `index`.
    public func weirsCleared(beforeReach index: Int) -> Int {
        let start = startY(ofReach: index)
        ensureWeirs(through: start + Tuning.reachLength)
        return weirYs.filter { $0 < start }.count
    }

    public func lighting(forWeirsCleared n: Int) -> LightingState {
        if modifier == .blackout { return .fogGray }
        return Tuning.band(forWeirsCleared: n).lighting
    }

    /// Tightened values for a weir count, with the Current modifier applied.
    public func tightened(weirsCleared n: Int) -> Tightened {
        let t = Tuning.tightened(weirsCleared: n)
        guard let m = modifier, m == .current else { return t }
        return Tightened(gate: t.gate,
                         cruiseSpeed: t.cruiseSpeed * m.cruiseScale,
                         steerRate: t.steerRate * m.steerScale,
                         fuelDrain: t.fuelDrain,
                         minChannelScale: t.minChannelScale,
                         lanternGapScale: t.lanternGapScale,
                         hazardGapScale: t.hazardGapScale)
    }

    // MARK: Weirs (pure function of distance, §3/§4)

    private func ensureWeirs(through y: Double) {
        while weirScanY <= y + Tuning.reachLength {
            let nextY: Double
            if let last = weirYs.last {
                let band = Tuning.band(forWeirsCleared: weirYs.count)
                nextY = last + band.weirGap
            } else {
                nextY = Tuning.openingLength
            }
            weirYs.append(nextY)
            weirScanY = nextY
        }
    }

    private func weirY(inReach index: Int) -> Double? {
        let start = startY(ofReach: index), end = start + Tuning.reachLength
        ensureWeirs(through: end)
        return weirYs.first { $0 >= start && $0 < end }
    }

    private func weirs(near start: Double, _ end: Double, margin: Double) -> [Double] {
        ensureWeirs(through: end + margin)
        return weirYs.filter { $0 >= start - margin && $0 <= end + margin }
    }

    // MARK: Skeleton

    private var widthScale: Double { modifier?.widthScale ?? 1 }

    private func skeleton(_ index: Int) -> Skeleton {
        if let s = skeletons[index] { return s }
        let start = startY(ofReach: index)
        let L = Tuning.reachLength
        let W = Tuning.referenceWidth
        let weirs = weirsCleared(beforeReach: index)
        let band = Tuning.band(forWeirsCleared: weirs)
        var rng = SplitMix64(seed: hashReach(seed: seed, index: index))

        let prevCenter: Double
        let prevWidth: Double
        if index == 0 {
            prevCenter = W / 2
            prevWidth = Tuning.openingWidth * W * widthScale
        } else {
            let p = skeleton(index - 1)
            prevCenter = p.endCenter
            prevWidth = p.endWidth
        }

        let isOpening = start < Tuning.openingLength
        var width: Double
        if isOpening {
            width = Tuning.openingWidth * W * widthScale
        } else {
            let drawn = rng.range(band.widthMin, band.widthMax) * W * widthScale
            width = RiverMath.clamp(drawn,
                                    prevWidth * (1 - Tuning.widthChangeMaxPerReach),
                                    prevWidth * (1 + Tuning.widthChangeMaxPerReach))
        }
        width = min(width, RiverMath.maxWidth)

        let halfForClamp = max(prevWidth, width) / 2
        let lo = RiverMath.bankMargin + halfForClamp
        let hi = W - RiverMath.bankMargin - halfForClamp
        var knots: [SplinePoint] = []
        var c = prevCenter
        let cps = band.controlPointsPerReach
        for k in 0..<cps {
            c = RiverMath.clamp(c + rng.range(-band.bend, band.bend) * W, lo, hi)
            let y = start + L * Double(k + 1) / Double(cps)
            knots.append(SplinePoint(y: y, x: c))
        }

        let s = Skeleton(index: index, startY: start, startCenter: prevCenter,
                         startWidth: prevWidth, endWidth: width, knots: knots,
                         bandIndex: band.index, weirsCleared: weirs, rng: rng)
        skeletons[index] = s
        return s
    }

    /// Spline knots for reach `index`: [before start, start, (elbow), end, after end].
    private func controlPoints(_ index: Int) -> [SplinePoint] {
        let s = skeleton(index)
        let before: SplinePoint
        if index == 0 {
            before = SplinePoint(y: s.startY - Tuning.reachLength, x: s.startCenter)
        } else {
            before = skeleton(index - 1).knotBeforeEnd
        }
        let after = skeleton(index + 1).knotAfterStart
        return [before, SplinePoint(y: s.startY, x: s.startCenter)] + s.knots + [after]
    }

    /// Empty reach carrying only geometry (and optionally islands) for queries.
    private func geometry(_ index: Int, islands: [Island] = [], inherited: [Island] = [], weir: Weir? = nil) -> Reach {
        let s = skeleton(index)
        return Reach(index: index, startY: s.startY, length: Tuning.reachLength,
                     centerStart: s.startCenter, centerEnd: s.endCenter,
                     widthStart: s.startWidth, widthEnd: s.endWidth,
                     controlPoints: controlPoints(index), bandIndex: s.bandIndex,
                     weirsCleared: s.weirsCleared, lighting: lighting(forWeirsCleared: s.weirsCleared),
                     islands: islands, inheritedIslands: inherited, pilings: [], hazards: [],
                     lanterns: [], weir: weir, lanternCursor: 0, hazardCursor: 0)
    }

    /// Narrowest water width over a y span, possibly crossing into the next reach.
    private func minWidth(from y0: Double, to y1: Double, step: Double = 4) -> Double {
        var w = Double.infinity
        var y = y0
        while y <= y1 + 0.001 {
            let g = geometry(max(0, Int(floor(y / Tuning.reachLength))))
            w = min(w, g.width(atY: y))
            y += step
        }
        w = min(w, geometry(Int(floor(y1 / Tuning.reachLength))).width(atY: y1))
        return w
    }

    // MARK: Prefix: islands, weir, lanterns

    private func prefix(_ index: Int) -> Prefix {
        if let p = prefixes[index] { return p }
        let s = skeleton(index)
        var rng = s.rng
        let start = s.startY, L = Tuning.reachLength, end = start + L
        let band = Tuning.band(forWeirsCleared: s.weirsCleared)
        let tight = tightened(weirsCleared: s.weirsCleared)
        let minChannel = band.minChannel * tight.minChannelScale
        let corridor = Tuning.corridorWidth
        let isOpening = start < Tuning.openingLength

        let prev: Prefix? = index > 0 ? prefix(index - 1) : nil
        let inherited = (prev?.islands ?? []).filter { $0.yEnd > start }
        let base = geometry(index)

        // Weir: span width = max(1.5 × minChannel, 72); span position seeded.
        var weir: Weir? = nil
        if let wy = weirY(inReach: index) {
            let span = max(Tuning.weirSpanChannelFactor * minChannel, Tuning.weirSpanMinimum)
            let left = base.leftBankX(atY: wy), right = base.rightBankX(atY: wy)
            let cx = rng.range(left + span / 2, right - span / 2)
            weir = Weir(y: wy, spanCenterX: cx, spanWidth: span)
        }

        // Island
        var islands: [Island] = []
        var splitLantern: Lantern? = nil
        if !isOpening, weir == nil, inherited.isEmpty, rng.chance(band.islandProbability) {
            let nextHasWeir = weirY(inReach: index + 1) != nil
            let isSplit = band.splitProbability > 0 && !nextHasWeir && rng.chance(band.splitProbability)
            let lengthFactor = isSplit
                ? rng.range(1.0, Tuning.islandLengthRange.upperBound)
                : rng.range(Tuning.islandLengthRange.lowerBound, 1.0)
            let length = L * lengthFactor
            let yStart = isSplit ? start : start + rng.range(0, L - length)
            let yEnd = yStart + length
            // The island follows the centreline, so the channels beside it are
            // (W(y) − w)/2 ± offset; the narrowest W along the island governs.
            let avail = minWidth(from: yStart, to: yEnd)
            var w = rng.range(Tuning.islandWidthRange.lowerBound, Tuning.islandWidthRange.upperBound) * avail
            let passable = max(minChannel, corridor + 8)   // one channel must take the corridor
            let narrowSideLeft = rng.chance(0.5)
            let minIslandWidth = Tuning.mineDiameter        // thinner than this is not an island
            let midY = yStart + length / 2
            let midCenter = geometry(Int(floor(midY / Tuning.reachLength))).centerX(atY: midY)

            if isSplit {
                // Narrow branch = 0.8 × wide branch; narrow ≥ minChannel, wide ≥ passable.
                var channels = avail - w
                var wide = channels / (1 + Tuning.splitNarrowBranchFactor)
                var narrow = wide * Tuning.splitNarrowBranchFactor
                if narrow < minChannel || wide < passable {
                    narrow = max(minChannel, passable * Tuning.splitNarrowBranchFactor)
                    wide = narrow / Tuning.splitNarrowBranchFactor
                    channels = narrow + wide
                    w = avail - channels
                }
                if w >= minIslandWidth, narrow >= Tuning.lanternWidth + 8 {
                    // Shifting the island toward the narrow side by (wide − narrow)/2.
                    let offset = (narrowSideLeft ? -1.0 : 1.0) * (wide - narrow) / 2
                    let island = Island(yStart: yStart, yEnd: yEnd, centerX: midCenter + offset, offsetX: offset,
                                        width: w, isSplit: true, narrowBranchOnLeft: narrowSideLeft)
                    islands.append(island)
                    let ly = RiverMath.clamp(midY, start + Tuning.lanternLength, end - Tuning.lanternLength)
                    let probe = geometry(index, islands: islands, inherited: inherited)
                    let branches = probe.channelsAt(y: ly)
                    let branch = (narrowSideLeft ? branches.first : branches.last) ?? (probe.leftBankX(atY: ly)...probe.rightBankX(atY: ly))
                    splitLantern = Lantern(x: (branch.lowerBound + branch.upperBound) / 2, y: ly)
                }
            } else {
                let needed = passable + minChannel
                if avail - needed < w { w = avail - needed }
                if w >= minIslandWidth {
                    // Offset range keeps the passable side ≥ passable and the other ≥ minChannel.
                    let half = (avail - w) / 2
                    let lo = narrowSideLeft ? minChannel - half : passable - half
                    let hi = narrowSideLeft ? half - passable : half - minChannel
                    let offset = rng.range(lo, hi)
                    islands.append(Island(yStart: yStart, yEnd: yEnd, centerX: midCenter + offset, offsetX: offset, width: w, isSplit: false))
                }
            }
        }

        let geo = geometry(index, islands: islands, inherited: inherited, weir: weir)

        // Lanterns
        var lanterns: [Lantern] = []
        var forced: [Lantern] = []
        if isOpening {
            for k in 1...Tuning.openingLanterns {
                let y = Tuning.openingLength * Double(k) / Double(Tuning.openingLanterns + 1)
                if y >= start && y < end {
                    forced.append(Lantern(x: lanternX(at: y, in: geo, rng: &rng), y: y))
                }
            }
        }
        if let sl = splitLantern { forced.append(sl) }
        forced.sort { $0.y < $1.y }

        var cursor = prev?.lanternCursor ?? 0
        let modScale = modifier?.lanternSpacingScale ?? 1
        let mean = band.lanternMeanGap * tight.lanternGapScale * modScale
        let capMean = band.lanternMeanGap * modScale
        var guardCount = 0
        while guardCount < 64 {
            guardCount += 1
            let nextForced = forced.first { $0.y > cursor }
            if isOpening {
                guard let f = nextForced else { break }
                lanterns.append(f); cursor = f.y
                continue
            }
            let jitter = rng.range(1 - Tuning.lanternGapJitter, 1 + Tuning.lanternGapJitter)
            let gap = min(mean * jitter, Tuning.lanternGapHardCap * capMean)
            var candidate = cursor + gap
            if let f = nextForced, f.y <= candidate {
                lanterns.append(f); cursor = f.y
                continue
            }
            guard candidate < end else { break }
            if candidate < start { candidate = start }
            // A split's wide branch stays empty: a regular Lantern never lands
            // beside a split island (its narrow branch already holds one).
            let pad = Tuning.lanternLength / 2
            if let split = (islands + inherited).first(where: { $0.isSplit && candidate > $0.yStart - pad && candidate < $0.yEnd + pad }) {
                if let f = nextForced {
                    lanterns.append(f); cursor = f.y
                    continue
                }
                let before = split.yStart - pad
                candidate = before > cursor + Tuning.lanternLength ? before : split.yEnd + pad
                if candidate >= end { break }
            }
            // Keep clear of a weir wall.
            if let wy = weir?.y, abs(candidate - wy) < Tuning.lanternLength {
                let before = wy - Tuning.lanternLength
                candidate = before > cursor + Tuning.lanternLength ? before : wy + Tuning.lanternLength
                if candidate >= end { break }
            }
            lanterns.append(Lantern(x: lanternX(at: candidate, in: geo, rng: &rng), y: candidate))
            cursor = candidate
        }

        let p = Prefix(geometry: geo, islands: islands, inheritedIslands: inherited, weir: weir,
                       lanterns: lanterns, lanternCursor: cursor, rng: rng)
        prefixes[index] = p
        return p
    }

    private func lanternX(at y: Double, in geo: Reach, rng: inout SplitMix64) -> Double {
        let hw = Tuning.lanternWidth / 2 + 4
        let fits = RiverMath.shrink(geo.channelsAt(y: y), by: hw)
        guard !fits.isEmpty else { return geo.centerX(atY: y) }
        let idx = rng.weightedIndex(fits.map { $0.upperBound - $0.lowerBound })
        return rng.range(fits[idx].lowerBound, fits[idx].upperBound)
    }

    // MARK: Reach: pilings and hazards

    private func buildReach(_ index: Int) -> Reach {
        let s = skeleton(index)
        let p = prefix(index)
        var rng = p.rng
        let start = s.startY, L = Tuning.reachLength, end = start + L
        let band = Tuning.band(forWeirsCleared: s.weirsCleared)
        let tight = tightened(weirsCleared: s.weirsCleared)
        let isOpening = start < Tuning.openingLength
        let geo = p.geometry
        let corridor = Tuning.corridorWidth
        let nearWeirs = weirs(near: start, end, margin: Tuning.hazardFreeAfterWeir + Tuning.hulkSize.length)
        let nearLanterns = (index > 0 ? prefix(index - 1).lanterns : []) + p.lanterns + prefix(index + 1).lanterns

        // Pilings: 0–2 groups per reach from band 2, within 24 pt of a bank or island tip.
        var pilings: [PilingGroup] = []
        if !isOpening {
            let groups = rng.int(in: band.pilingGroups)
            for _ in 0..<groups {
                let n = rng.int(in: Tuning.pilingsPerGroup)
                let onIslandTip = !p.islands.isEmpty && rng.chance(0.4)
                if onIslandTip, let island = p.islands.first {
                    let atStart = rng.chance(0.5)
                    let y = atStart ? island.yStart - Tuning.pilingDiameter : island.yEnd + Tuning.pilingDiameter
                    guard y > start + Tuning.pilingDiameter, y < end - Tuning.pilingDiameter else { continue }
                    let count = min(n, max(2, Int(island.width / Tuning.pilingDiameter)))
                    let span = geo.islandSpan(island, atY: y)
                    let tipCenter = (span.lowerBound + span.upperBound) / 2
                    let xs = (0..<count).map { tipCenter + (Double($0) - Double(count - 1) / 2) * Tuning.pilingDiameter }
                    pilings.append(PilingGroup(y: y, xs: xs))
                    continue
                }
                let y = rng.range(start + 40, end - 40)
                let leftSide = rng.chance(0.5)
                guard !pilings.contains(where: { abs($0.y - y) < 100 }) else { continue }
                guard !nearWeirs.contains(where: { abs($0 - y) < 60 }) else { continue }
                guard !nearLanterns.contains(where: { abs($0.y - y) < 100 }) else { continue }
                let channels = geo.channelsAt(y: y)
                guard let ch = leftSide ? channels.first : channels.last else { continue }
                let free = (ch.upperBound - ch.lowerBound) - corridor - 8
                let count = min(n, Int(floor(free / Tuning.pilingDiameter)))
                guard count >= 2 else { continue }
                let xs: [Double] = (0..<count).map { k in
                    let offset = Tuning.pilingDiameter / 2 + Double(k) * Tuning.pilingDiameter
                    return leftSide ? ch.lowerBound + offset : ch.upperBound - offset
                }
                pilings.append(PilingGroup(y: y, xs: xs))
            }
        }

        // Hazards
        var hazards: [Hazard] = []
        var cursor = index > 0 ? reaches[index - 1]?.hazardCursor ?? Tuning.openingLength : Tuning.openingLength
        if !isOpening {
            let meanGap = band.hazardMeanGap * tight.hazardGapScale
            var guardCount = 0
            while guardCount < 64 {
                guardCount += 1
                let gap = meanGap * rng.range(1 - Tuning.hazardGapJitter, 1 + Tuning.hazardGapJitter)
                var y = max(cursor + gap, start)
                let kindIndex = rng.weightedIndex(band.hazardWeights)
                let kind = drawKind(kindIndex, band: band, rng: &rng)
                let probe = Hazard(id: 0, kind: kind, x: 0, y: 0)
                y = pushOutOfExclusions(y: y, halfLength: probe.footprintHalfLength, weirs: nearWeirs, lanterns: nearLanterns)
                guard y < end else { break }
                guard let x = hazardX(at: y, halfWidth: probe.footprintHalfWidth, in: geo, rng: &rng) else {
                    cursor = y
                    continue
                }
                hazards.append(Hazard(id: index * 1000 + hazards.count, kind: kind, x: x, y: y))
                cursor = y
            }

            // Safe-path check with deterministic re-rolls, then drop the offender.
            var attempts = 0
            while let failY = corridorFailure(geo: geo, pilings: pilings, hazards: hazards, weir: p.weir, tight: tight) {
                if attempts < Tuning.hazardRerollLimit {
                    attempts += 1
                    for k in hazards.indices {
                        if let x = hazardX(at: hazards[k].y, halfWidth: hazards[k].footprintHalfWidth, in: geo, rng: &rng) {
                            hazards[k].x = x
                        }
                    }
                } else if !hazards.isEmpty {
                    let victim = hazards.indices.min { abs(hazards[$0].y - failY) < abs(hazards[$1].y - failY) }!
                    hazards.remove(at: victim)
                    attempts = 0
                } else if !pilings.isEmpty {
                    let victim = pilings.indices.min { abs(pilings[$0].y - failY) < abs(pilings[$1].y - failY) }!
                    pilings.remove(at: victim)
                } else {
                    break // islands/weir alone; geometry guarantees a passable channel
                }
            }
        }

        return Reach(index: index, startY: start, length: L,
                     centerStart: s.startCenter, centerEnd: s.endCenter,
                     widthStart: s.startWidth, widthEnd: s.endWidth,
                     controlPoints: geo.controlPoints, bandIndex: s.bandIndex,
                     weirsCleared: s.weirsCleared, lighting: geo.lighting,
                     islands: p.islands, inheritedIslands: p.inheritedIslands,
                     pilings: pilings, hazards: hazards, lanterns: p.lanterns, weir: p.weir,
                     lanternCursor: p.lanternCursor, hazardCursor: cursor)
    }

    private func drawKind(_ kindIndex: Int, band: Band, rng: inout SplitMix64) -> Hazard.Kind {
        switch kindIndex {
        case 0:
            let drifts = band.hulkDrifts || modifier == .drift
            let driftRange = band.hulkDrifts ? band.hulkDrift : Tuning.bands[2].hulkDrift
            let drift = drifts ? rng.range(driftRange.lowerBound, driftRange.upperBound) : 0
            return .hulk(drift: drift)
        case 1:
            let cadence = rng.range(band.dragonflyDashCadence.lowerBound, band.dragonflyDashCadence.upperBound)
            return .dragonfly(fires: band.dragonflyFires, dashCadence: cadence)
        default:
            let range = modifier == .longTeeth ? Tuning.longTeethMines : band.teethMines
            let mines = rng.int(in: range)
            return .teeth(mineCount: mines, pivotDegPerSec: band.teethPivotDegPerSec,
                          radius: Double(mines) * Tuning.teethMineSpacing)
        }
    }

    /// Moves `y` past any Weir or Lantern exclusion zone it overlaps.
    private func pushOutOfExclusions(y: Double, halfLength: Double, weirs: [Double], lanterns: [Lantern]) -> Double {
        var y = y
        var changed = true
        var iterations = 0
        while changed && iterations < 16 {
            changed = false
            iterations += 1
            for w in weirs {
                // Never overlap the wall, never inside the 240 pt after it.
                if y + halfLength > w - Tuning.mineDiameter && y - halfLength < w + Tuning.hazardFreeAfterWeir {
                    y = w + Tuning.hazardFreeAfterWeir + halfLength
                    changed = true
                }
            }
            for l in lanterns {
                // "150 pt of a Lantern": the hazard's centre stays 150 pt clear of the pontoon's ends.
                let clearance = Tuning.hazardFreeAroundLantern + l.length / 2
                if abs(y - l.y) < clearance {
                    y = l.y + clearance
                    changed = true
                }
            }
        }
        return y
    }

    private func hazardX(at y: Double, halfWidth: Double, in geo: Reach, rng: inout SplitMix64) -> Double? {
        let fits = RiverMath.shrink(geo.channelsAt(y: y), by: halfWidth + 4)
        guard !fits.isEmpty else { return nil }
        let idx = rng.weightedIndex(fits.map { $0.upperBound - $0.lowerBound })
        return rng.range(fits[idx].lowerBound, fits[idx].upperBound)
    }

    // MARK: Safe-path corridor (§4)

    /// Sweeps a corridor 2.2 × craft width up the reach in 20 pt steps. The
    /// reachable set of craft-centre x positions grows by `steerRate / cruise`
    /// per point of y and is intersected with the free water. Returns the y at
    /// which the reachable set first becomes empty, or nil if a path exists.
    private func corridorFailure(geo: Reach, pilings: [PilingGroup], hazards: [Hazard], weir: Weir?, tight: Tightened) -> Double? {
        let half = Tuning.corridorWidth / 2
        let slope = tight.steerRate / tight.cruiseSpeed
        let step = Tuning.corridorStepY
        var y = geo.startY
        var reachable = free(at: y, geo: geo, pilings: pilings, hazards: hazards, weir: weir, half: half)
        if reachable.isEmpty { return y }
        while y < geo.endY - 0.001 {
            y = min(y + step, geo.endY)
            let f = free(at: y, geo: geo, pilings: pilings, hazards: hazards, weir: weir, half: half)
            reachable = RiverMath.intersect(RiverMath.grow(reachable, by: slope * step), f)
            if reachable.isEmpty { return y }
        }
        return nil
    }

    private func free(at y: Double, geo: Reach, pilings: [PilingGroup], hazards: [Hazard], weir: Weir?, half: Double) -> [ClosedRange<Double>] {
        var f = RiverMath.shrink(geo.channelsAt(y: y), by: half)
        if let w = weir, abs(y - w.y) <= Tuning.corridorStepY / 2 {
            f = RiverMath.intersect(f, [(w.spanLeftX + half)...(w.spanRightX - half)])
        }
        for h in hazards where abs(y - h.y) <= h.footprintHalfLength + Tuning.corridorStepY / 2 {
            f = RiverMath.subtract(f, (h.x - h.footprintHalfWidth - half)...(h.x + h.footprintHalfWidth + half))
        }
        for g in pilings where abs(y - g.y) <= Tuning.pilingDiameter / 2 + Tuning.corridorStepY / 2 {
            guard let lo = g.xs.min(), let hi = g.xs.max() else { continue }
            f = RiverMath.subtract(f, (lo - Tuning.pilingDiameter / 2 - half)...(hi + Tuning.pilingDiameter / 2 + half))
        }
        return f
    }
}
