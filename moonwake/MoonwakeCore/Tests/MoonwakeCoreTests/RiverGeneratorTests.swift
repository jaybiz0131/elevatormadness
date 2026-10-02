import XCTest
@testable import MoonwakeCore

final class RiverGeneratorTests: XCTestCase {
    let seeds: [UInt64] = [1, 42, 0xDEAD_BEEF, 9_876_543_210, fnv1a("2026-10-02")]
    let reachCount = 60

    private func reaches(seed: UInt64, modifier: DailyModifier? = nil) -> [Reach] {
        let g = RiverGenerator(seed: seed, modifier: modifier)
        return (0..<reachCount).map { g.reach($0) }
    }

    // MARK: Determinism

    func testSameSeedProducesIdenticalReaches() {
        for seed in seeds {
            let a = reaches(seed: seed)
            let b = reaches(seed: seed)
            XCTAssertEqual(a, b, "seed \(seed) diverged")
        }
    }

    func testReachesCanBeRequestedOutOfOrder() {
        let g1 = RiverGenerator(seed: 42)
        let g2 = RiverGenerator(seed: 42)
        let late = g1.reach(37)
        let ordered = (0...37).map { g2.reach($0) }
        XCTAssertEqual(late, ordered[37])
        XCTAssertEqual(g1.reach(5), ordered[5])
    }

    func testDifferentSeedsDiffer() {
        let a = reaches(seed: 1)
        let b = reaches(seed: 2)
        XCTAssertNotEqual(a, b)
        // Geometry itself should differ, not just contents.
        let differingCenters = zip(a, b).filter { abs($0.centerEnd - $1.centerEnd) > 0.5 }.count
        XCTAssertGreaterThan(differingCenters, reachCount / 2)
    }

    func testDailySeedAndModifier() {
        let d = DailyModifier.forDate("2026-10-02")
        XCTAssertEqual(d.seed, fnv1a("2026-10-02"))
        XCTAssertEqual(d.modifier, DailyModifier.allCases[Int(d.seed % 6)])
        XCTAssertNotEqual(DailyModifier.forDate("2026-10-03").seed, d.seed)
        XCTAssertEqual(fnv1a(""), 0xCBF2_9CE4_8422_2325)
    }

    func testSplitMixKnownValues() {
        // Reference values of SplitMix64 for seed 0 (Java SplittableRandom / Vigna).
        var r = SplitMix64(seed: 0)
        XCTAssertEqual(r.next(), 0xE220_A839_7B1D_CDAF)
        XCTAssertEqual(r.next(), 0x6E78_9E6A_A1B9_65F4)
        var s = SplitMix64(seed: 7)
        for _ in 0..<1000 {
            let d = s.nextDouble()
            XCTAssert(d >= 0 && d < 1)
            let i = s.int(in: -3...3)
            XCTAssert((-3...3).contains(i))
        }
    }

    // MARK: Geometry

    func testBanksAlwaysOnScreen() {
        let margin = Tuning.bankMarginFraction * Tuning.referenceWidth
        for seed in seeds {
            for modifier in [nil, DailyModifier.narrows] {
                for r in reaches(seed: seed, modifier: modifier) {
                    var y = r.startY
                    while y <= r.endY {
                        let l = r.leftBankX(atY: y), rt = r.rightBankX(atY: y)
                        XCTAssertGreaterThanOrEqual(l, margin - 1e-6, "seed \(seed) reach \(r.index) y \(y)")
                        XCTAssertLessThanOrEqual(rt, Tuning.referenceWidth - margin + 1e-6, "seed \(seed) reach \(r.index) y \(y)")
                        XCTAssertGreaterThan(rt - l, 0)
                        y += 5
                    }
                }
            }
        }
    }

    func testWidthChangeAtMost20PercentPerReach() {
        for seed in seeds {
            let rs = reaches(seed: seed)
            for r in rs {
                let ratio = r.widthEnd / r.widthStart
                XCTAssertLessThanOrEqual(ratio, 1 + Tuning.widthChangeMaxPerReach + 1e-9, "seed \(seed) reach \(r.index)")
                XCTAssertGreaterThanOrEqual(ratio, 1 - Tuning.widthChangeMaxPerReach - 1e-9, "seed \(seed) reach \(r.index)")
            }
            for i in 1..<rs.count {
                XCTAssertEqual(rs[i].widthStart, rs[i - 1].widthEnd, accuracy: 1e-9)
                XCTAssertEqual(rs[i].centerStart, rs[i - 1].centerEnd, accuracy: 1e-9)
                // Spline continuity at the boundary.
                XCTAssertEqual(rs[i].centerX(atY: rs[i].startY), rs[i - 1].centerX(atY: rs[i - 1].endY), accuracy: 1e-6)
            }
        }
    }

    func testWidthsWithinBandRange() {
        for seed in seeds {
            for r in reaches(seed: seed) where r.startY >= Tuning.openingLength {
                let band = Tuning.band(forWeirsCleared: r.weirsCleared)
                // The 20% clamp may hold a width just outside the band range for a reach
                // or two after a band change, so allow that slack.
                XCTAssertLessThanOrEqual(r.widthEnd, band.widthMax * Tuning.referenceWidth * 1.2 + 1e-6)
                XCTAssertGreaterThanOrEqual(r.widthEnd, band.widthMin * Tuning.referenceWidth * 0.8 - 1e-6)
            }
        }
    }

    func testOpeningReach() {
        for seed in seeds {
            let rs = reaches(seed: seed)
            let opening = rs.filter { $0.startY < Tuning.openingLength }
            XCTAssertEqual(opening.count, 3)
            for r in opening {
                XCTAssertEqual(r.widthEnd, Tuning.openingWidth * Tuning.referenceWidth, accuracy: 1e-9)
                XCTAssert(r.hazards.isEmpty)
                XCTAssert(r.islands.isEmpty)
                XCTAssert(r.pilings.isEmpty)
                XCTAssertNil(r.weir)
            }
            XCTAssertEqual(opening.flatMap { $0.lanterns }.count, Tuning.openingLanterns)
            XCTAssertEqual(rs[3].weir?.y, Tuning.openingLength)
        }
    }

    func testMinimumChannelBesideIslands() {
        var islandCount = 0
        for seed in seeds {
            let g = RiverGenerator(seed: seed)
            let river = g.river(through: reachCount + 1)
            for r in river.reaches.prefix(reachCount) {
                let band = Tuning.band(forWeirsCleared: r.weirsCleared)
                let mc = band.minChannel * Tuning.tightened(weirsCleared: r.weirsCleared).minChannelScale
                for island in r.islands {
                    islandCount += 1
                    XCTAssertGreaterThanOrEqual(island.length, 0.5 * Tuning.reachLength - 1e-6)
                    XCTAssertLessThanOrEqual(island.length, 1.2 * Tuning.reachLength + 1e-6)
                    XCTAssertEqual(island.isSplit, island.length > Tuning.reachLength)
                    var minLeft = Double.infinity, minRight = Double.infinity
                    var y = island.yStart
                    while y <= island.yEnd {
                        let span = river.islandSpan(island, atY: y)
                        let left = span.lowerBound - river.leftBankX(atY: y)
                        let right = river.rightBankX(atY: y) - span.upperBound
                        XCTAssertGreaterThanOrEqual(left, mc - 1e-6, "seed \(seed) reach \(r.index) y \(y)")
                        XCTAssertGreaterThanOrEqual(right, mc - 1e-6, "seed \(seed) reach \(r.index) y \(y)")
                        // One channel must be wide enough for the safe corridor.
                        XCTAssertGreaterThanOrEqual(max(left, right), Tuning.corridorWidth)
                        minLeft = min(minLeft, left); minRight = min(minRight, right)
                        y += 10
                    }
                    // Island lies in the water, centred at its mid-y.
                    let midSpan = river.islandSpan(island, atY: island.midY)
                    XCTAssertEqual((midSpan.lowerBound + midSpan.upperBound) / 2, island.centerX, accuracy: 1e-6)
                    if island.isSplit {
                        // The narrow branch holds a Lantern; the other branch is empty.
                        guard let narrowLeft = island.narrowBranchOnLeft else {
                            XCTFail("split island without a narrow side"); continue
                        }
                        let inIsland = r.lanterns.filter { $0.y > island.yStart && $0.y < island.yEnd }
                        XCTAssertEqual(inIsland.count, 1, "split island in reach \(r.index) seed \(seed) should hold exactly one Lantern")
                        for l in inIsland {
                            let span = river.islandSpan(island, atY: l.y)
                            XCTAssertEqual(l.x < span.lowerBound, narrowLeft, "seed \(seed) reach \(r.index): Lantern not in the narrow branch")
                        }
                        // Narrow branch is 0.8 × the wide one at the tightest point.
                        let (narrow, wide) = narrowLeft ? (minLeft, minRight) : (minRight, minLeft)
                        XCTAssertLessThanOrEqual(narrow, wide + 1e-6)
                        XCTAssertEqual(narrow / wide, Tuning.splitNarrowBranchFactor, accuracy: 0.05)
                    } else {
                        XCTAssertNil(island.narrowBranchOnLeft)
                    }
                }
            }
        }
        XCTAssertGreaterThan(islandCount, 10, "expected islands to appear across \(seeds.count) seeds")
    }

    func testChannelsSplitAroundIslands() {
        for seed in seeds {
            for r in reaches(seed: seed) {
                for island in r.allIslands where island.covers(y: r.startY + 300) || r.islands.contains(island) {
                    let y = RiverMath.clamp((island.yStart + island.yEnd) / 2, r.startY, r.endY - 1)
                    guard island.covers(y: y) else { continue }
                    let channels = r.channelsAt(y: y)
                    let span = r.islandSpan(island, atY: y)
                    XCTAssertEqual(channels.count, 2)
                    XCTAssertEqual(channels[0].upperBound, span.lowerBound, accuracy: 1e-9)
                    XCTAssertEqual(channels[1].lowerBound, span.upperBound, accuracy: 1e-9)
                }
            }
        }
    }

    // MARK: Lanterns

    func testLanternGapNeverExceedsHardCap() {
        for seed in seeds {
            let rs = reaches(seed: seed)
            let lanterns = rs.flatMap { r in r.lanterns.map { ($0, r) } }.sorted { $0.0.y < $1.0.y }
            XCTAssertGreaterThan(lanterns.count, 20)
            for i in 1..<lanterns.count {
                let (l, r) = lanterns[i]
                let gap = l.y - lanterns[i - 1].0.y
                let band = Tuning.band(forWeirsCleared: r.weirsCleared)
                XCTAssertLessThanOrEqual(gap, Tuning.lanternGapHardCap * band.lanternMeanGap + 1e-6,
                                         "seed \(seed) lantern gap \(gap) at y \(l.y) band \(band.index)")
                XCTAssertGreaterThan(gap, Tuning.lanternLength)
            }
            // Lanterns sit in water.
            let river = River(reaches: rs)
            for (l, _) in lanterns {
                let inWater = river.channelsAt(y: l.y).contains { $0.contains(l.x - Tuning.lanternWidth / 2) && $0.contains(l.x + Tuning.lanternWidth / 2) }
                XCTAssert(inWater, "seed \(seed) lantern at \(l.x),\(l.y) is on land")
            }
        }
    }

    func testThinLanternsModifierWidensSpacing() {
        let base = reaches(seed: 42).flatMap { $0.lanterns }.count
        let thin = reaches(seed: 42, modifier: .thinLanterns).flatMap { $0.lanterns }.count
        XCTAssertLessThan(thin, base)
    }

    // MARK: Hazards

    func testHazardExclusionZones() {
        var hazardCount = 0
        for seed in seeds {
            let rs = reaches(seed: seed)
            let weirs = rs.compactMap { $0.weir }
            let lanterns = rs.flatMap { $0.lanterns }
            for r in rs {
                for h in r.hazards {
                    hazardCount += 1
                    for w in weirs {
                        let after = h.y - w.y
                        XCTAssertFalse(after >= 0 && after < Tuning.hazardFreeAfterWeir,
                                       "seed \(seed) hazard \(h.id) at \(h.y) is \(after) pt after weir \(w.y)")
                    }
                    for l in lanterns {
                        XCTAssertGreaterThanOrEqual(abs(h.y - l.y), Tuning.hazardFreeAroundLantern,
                                                    "seed \(seed) hazard \(h.id) at \(h.y) near lantern \(l.y)")
                    }
                    XCTAssert(r.contains(y: h.y))
                    // In the water.
                    let inWater = r.channelsAt(y: h.y).contains { $0.contains(h.x - h.footprintHalfWidth) && $0.contains(h.x + h.footprintHalfWidth) }
                    XCTAssert(inWater, "seed \(seed) hazard \(h.id) at \(h.x),\(h.y) is on land")
                }
            }
        }
        XCTAssertGreaterThan(hazardCount, 100)
    }

    func testHazardMixFollowsBand() {
        // Band 1 has no Dragonflies and moored Hulks.
        for seed in seeds {
            for r in reaches(seed: seed) where r.bandIndex == 1 {
                for h in r.hazards {
                    switch h.kind {
                    case .dragonfly: XCTFail("dragonfly in band 1")
                    case .hulk(let drift): XCTAssertEqual(drift, 0)
                    case .teeth(let n, let pivot, _):
                        XCTAssertEqual(n, 3)
                        XCTAssertEqual(pivot, 10)
                    }
                }
            }
        }
        // Modifiers.
        // Drift: Hulks drift from band 1 (at band 3's 40–60 pt/s, the lowest listed range).
        let drift = reaches(seed: 7, modifier: .drift).filter { $0.bandIndex <= 2 }.flatMap { $0.hazards }.compactMap { h -> Double? in
            if case .hulk(let d) = h.kind { return d } else { return nil }
        }
        XCTAssert(!drift.isEmpty && drift.allSatisfy { $0 >= 40 && $0 <= 60 }, "drift values: \(drift)")
        let teeth = reaches(seed: 7, modifier: .longTeeth).flatMap { $0.hazards }.compactMap { h -> Int? in
            if case .teeth(let n, _, _) = h.kind { return n } else { return nil }
        }
        XCTAssert(!teeth.isEmpty && teeth.allSatisfy { (5...7).contains($0) })
    }

    func testWeirPlacement() {
        for seed in seeds {
            let rs = reaches(seed: seed)
            let weirs = rs.compactMap { $0.weir }
            XCTAssertEqual(weirs.first?.y, Tuning.openingLength)
            for i in 1..<weirs.count {
                // After clearing weir i−1 the player has cleared i weirs; that band's gap applies.
                let band = Tuning.band(forWeirsCleared: i)
                XCTAssertEqual(weirs[i].y - weirs[i - 1].y, band.weirGap, accuracy: 1e-9)
            }
            let river = River(reaches: rs)
            for (k, w) in weirs.enumerated() {
                let band = Tuning.band(forWeirsCleared: k)
                let mc = band.minChannel * Tuning.tightened(weirsCleared: k).minChannelScale
                XCTAssertEqual(w.spanWidth, max(Tuning.weirSpanChannelFactor * mc, Tuning.weirSpanMinimum), accuracy: 1e-9)
                XCTAssertGreaterThanOrEqual(w.spanLeftX, river.leftBankX(atY: w.y) - 1e-6)
                XCTAssertLessThanOrEqual(w.spanRightX, river.rightBankX(atY: w.y) + 1e-6)
            }
            // Band selection follows weirs placed before the reach.
            for r in rs {
                let before = weirs.filter { $0.y < r.startY }.count
                XCTAssertEqual(r.weirsCleared, before)
                XCTAssertEqual(r.bandIndex, Tuning.band(forWeirsCleared: before).index)
            }
            XCTAssertGreaterThanOrEqual(rs.last!.bandIndex, 3, "60 reaches should reach band 3")
        }
    }

    // MARK: Safe corridor

    /// Independent corridor sweep: the reachable set of craft-centre positions,
    /// grown by steerRate/cruise per pt of y and intersected with free water
    /// (banks, islands, pilings, static hazard footprints, weir span).
    private func corridorExists(in r: Reach) -> Bool {
        let tight = Tuning.tightened(weirsCleared: r.weirsCleared)
        let slope = tight.steerRate / tight.cruiseSpeed
        let half = Tuning.corridorWidth / 2
        let step = 10.0
        func free(_ y: Double) -> [ClosedRange<Double>] {
            var f = RiverMath.shrink(r.channelsAt(y: y), by: half)
            if let w = r.weir, abs(y - w.y) <= step / 2 {
                f = RiverMath.intersect(f, [(w.spanLeftX + half)...(w.spanRightX - half)])
            }
            for h in r.hazards where abs(y - h.y) <= h.footprintHalfLength {
                f = RiverMath.subtract(f, (h.x - h.footprintHalfWidth - half)...(h.x + h.footprintHalfWidth + half))
            }
            for g in r.pilings where abs(y - g.y) <= Tuning.pilingDiameter / 2 {
                f = RiverMath.subtract(f, (g.xs.min()! - 8 - half)...(g.xs.max()! + 8 + half))
            }
            return f
        }
        var y = r.startY
        var reachable = free(y)
        while y < r.endY {
            y = min(y + step, r.endY)
            reachable = RiverMath.intersect(RiverMath.grow(reachable, by: slope * step), free(y))
            if reachable.isEmpty { return false }
        }
        return true
    }

    func testSafeCorridorExistsInEveryReach() {
        for seed in seeds {
            for r in reaches(seed: seed) {
                XCTAssert(corridorExists(in: r), "seed \(seed) reach \(r.index) has no safe corridor")
            }
        }
    }

    func testPilingsNearBanksOrIslandTips() {
        var count = 0
        for seed in seeds {
            for r in reaches(seed: seed) {
                XCTAssert(r.pilings.isEmpty || r.bandIndex >= 2)
                for g in r.pilings {
                    count += 1
                    XCTAssert((2...4).contains(g.xs.count))
                    let left = r.leftBankX(atY: g.y), right = r.rightBankX(atY: g.y)
                    let nearBank = g.xs.contains { abs($0 - left) <= Tuning.pilingBankOffset || abs($0 - right) <= Tuning.pilingBankOffset }
                    let nearTip = r.islands.contains { abs($0.yStart - g.y) <= Tuning.pilingBankOffset || abs($0.yEnd - g.y) <= Tuning.pilingBankOffset }
                    XCTAssert(nearBank || nearTip, "seed \(seed) reach \(r.index) piling group not near bank or island tip")
                }
            }
        }
        XCTAssertGreaterThan(count, 0)
    }

    func testLightingAndBlackout() {
        let g = RiverGenerator(seed: 3, modifier: .blackout)
        XCTAssertEqual(g.reach(0).lighting, .fogGray)
        XCTAssertEqual(RiverGenerator(seed: 3).reach(0).lighting, .blueNight)
        XCTAssertEqual(Tuning.band(forWeirsCleared: 0).index, 1)
        XCTAssertEqual(Tuning.band(forWeirsCleared: 3).index, 1)
        XCTAssertEqual(Tuning.band(forWeirsCleared: 4).index, 2)
        XCTAssertEqual(Tuning.band(forWeirsCleared: 12).index, 3)
        XCTAssertEqual(Tuning.band(forWeirsCleared: 13).index, 4)
        XCTAssertEqual(Tuning.band(forWeirsCleared: 19).index, 5)
        XCTAssertEqual(Tuning.band(forWeirsCleared: 400).index, 5)
    }

    func testTighteningCapsAtGate15() {
        let t0 = Tuning.tightened(weirsCleared: 0)
        XCTAssertEqual(t0.cruiseSpeed, 260)
        XCTAssertEqual(t0.steerRate, 300)
        XCTAssertEqual(t0.fuelDrain, 3.6)
        let t15 = Tuning.tightened(weirsCleared: 15)
        XCTAssertEqual(t15.cruiseSpeed, 377, accuracy: 0.01)   // 260 × 1.45 (doc rounds to 373)
        XCTAssertEqual(t15.steerRate, 390, accuracy: 0.01)
        XCTAssertEqual(t15.fuelDrain, 4.68, accuracy: 0.001)
        XCTAssertEqual(t15.minChannelScale, 0.70, accuracy: 1e-9)
        XCTAssertEqual(t15.lanternGapScale, 1.60, accuracy: 1e-9)
        XCTAssertEqual(t15.hazardGapScale, 0.55, accuracy: 1e-9)
        XCTAssertEqual(Tuning.tightened(weirsCleared: 40), t15)
    }
}
