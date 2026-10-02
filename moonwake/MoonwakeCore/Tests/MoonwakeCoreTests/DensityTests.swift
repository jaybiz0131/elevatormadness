import XCTest
@testable import MoonwakeCore

/// Loose sanity bounds on how much the generator actually places per band, so
/// a future change that silently starves or floods a band is caught.
final class DensityTests: XCTestCase {
    func testPerBandDensityIsPlausible() {
        for seed in [UInt64(1), 42, 777, 123_456_789] {
            let g = RiverGenerator(seed: seed)
            var perBand: [Int: (reaches: Int, hazards: Int, islands: Int, lanterns: Int)] = [:]
            for i in 0..<120 {
                let r = g.reach(i)
                var e = perBand[r.bandIndex] ?? (0, 0, 0, 0)
                e.reaches += 1
                e.hazards += r.hazards.count
                e.islands += r.islands.count
                e.lanterns += r.lanterns.count
                perBand[r.bandIndex] = e
            }
            XCTAssertEqual(perBand.keys.sorted(), [1, 2, 3, 4, 5], "120 reaches should span all five bands")
            for (b, e) in perBand {
                let band = Tuning.bands[b - 1]
                let length = Double(e.reaches) * Tuning.reachLength
                // Hazards: exclusion zones (240 pt after Weirs, 150 pt around Lanterns)
                // and the hazard-free opening thin the nominal mean gap.
                let hazardGap = length / Double(max(1, e.hazards))
                XCTAssertGreaterThan(hazardGap, band.hazardMeanGap * 0.5, "seed \(seed) band \(b) too dense")
                XCTAssertLessThan(hazardGap, band.hazardMeanGap * 2.2, "seed \(seed) band \(b) too sparse")
                // Lanterns: mean gap grows with tightening (+4% per Weir, cap 1.6×).
                let lanternGap = length / Double(max(1, e.lanterns))
                XCTAssertGreaterThan(lanternGap, band.lanternMeanGap * 0.6, "seed \(seed) band \(b) lanterns too dense")
                XCTAssertLessThan(lanternGap, band.lanternMeanGap * 1.6 * 1.25, "seed \(seed) band \(b) lanterns too sparse")
                if b >= 3 {
                    XCTAssertGreaterThan(e.islands, 0, "seed \(seed) band \(b) never placed an island")
                }
            }
        }
    }

    func testEveryHazardKindAppearsByBandFive() {
        let g = RiverGenerator(seed: 2024)
        var sawHulk = false, sawDragonfly = false, sawTeeth = false, sawFiring = false, sawDrift = false
        for i in 0..<150 {
            for h in g.reach(i).hazards {
                switch h.kind {
                case .hulk(let d): sawHulk = true; if d > 0 { sawDrift = true }
                case .dragonfly(let fires, _): sawDragonfly = true; if fires { sawFiring = true }
                case .teeth: sawTeeth = true
                }
            }
        }
        XCTAssert(sawHulk && sawDragonfly && sawTeeth && sawFiring && sawDrift)
    }
}
