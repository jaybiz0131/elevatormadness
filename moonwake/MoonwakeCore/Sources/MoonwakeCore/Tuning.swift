// Tuning — every number from design/moonwake-design.md lives here.
// Section references (§) point at the design document.

public enum LightingState: String, Equatable, Sendable {
    case blueNight
    case amberDusk
    case fogGray
}

/// One row of the §5 band table. Widths and bend are fractions of screen width;
/// everything else is in points at the 390 pt reference width.
public struct Band: Equatable, Sendable {
    public let index: Int                       // 1...5
    public let name: String
    public let weirsCleared: ClosedRange<Int>   // 19+ is modelled as 19...Int.max
    public let widthMin: Double                 // × screen width
    public let widthMax: Double                 // × screen width
    public let bend: Double                     // ± × screen width per control point
    public let controlPointsPerReach: Int       // 1 (bands 1–3) or 2 "elbows" (bands 4–5)
    public let minChannel: Double               // pt, beside islands
    public let islandProbability: Double
    public let splitProbability: Double         // given an island
    public let pilingGroups: ClosedRange<Int>   // groups per reach
    public let hazardMeanGap: Double            // pt
    public let hazardWeights: [Double]          // Hulk / Dragonfly / Teeth
    public let hulkDrifts: Bool
    public let hulkDrift: ClosedRange<Double>   // pt/s when drifting
    public let dragonflyDashes: Bool
    public let dragonflyDashCadence: ClosedRange<Double> // s between dashes
    public let dragonflyFires: Bool
    public let dragonflyFireInterval: Double    // s; 0 when it does not fire
    public let teethMines: ClosedRange<Int>
    public let teethPivotDegPerSec: Double
    public let lanternMeanGap: Double           // pt
    public let weirGap: Double                  // pt
    public let lighting: LightingState
}

/// Values that tighten additively per Weir cleared (§3 "Tightening summary").
public struct Tightened: Equatable, Sendable {
    public let gate: Int               // the capped gate count used
    public let cruiseSpeed: Double     // pt/s
    public let steerRate: Double       // pt/s
    public let fuelDrain: Double       // units/s
    public let minChannelScale: Double // multiply the band's minChannel
    public let lanternGapScale: Double // multiply the band's lantern mean gap
    public let hazardGapScale: Double  // multiply the band's hazard mean gap
}

public struct Tuning {
    // MARK: Reference geometry (§0, §2)
    public static let referenceWidth: Double = 390
    public static let referenceHeight: Double = 844
    public static let craftLaneFraction: Double = 0.70   // craft at 70% of screen height from top
    public static let hudFraction: Double = 0.12         // top 12% is HUD
    public static let lookAheadPoints: Double = 590      // river visible above the craft
    public static let craftWidth: Double = 28            // Needle hull width (2.2× → corridor)
    public static let craftLength: Double = 64

    // MARK: Steering (§2)
    public static let steerDeadZone: Double = 10         // pt radius around anchor (thumb jitter is ~5 pt)
    public static let steerFullDeflection: Double = 48   // pt horizontal displacement
    public static let steerRateBase: Double = 300        // pt/s at full deflection, band 1
    public static let lateralTimeConstant: Double = 0.07 // s, first-order lag
    public static let maxLeanDegrees: Double = 14

    // MARK: Throttle (§2)
    public static let throttleVerticalDeadZone: Double = 24  // ±pt keeps cruise
    public static let throttleFullDisplacement: Double = 64  // pt up/down → fast/slow (40 pt band resists drift)
    public static let slowMultiplier: Double = 0.60
    public static let cruiseMultiplier: Double = 1.00
    public static let fastMultiplier: Double = 1.60
    public static let speedBlendAcceleration: Double = 600   // pt/s²
    public static let cruiseSpeedBase: Double = 260          // pt/s, band 1

    // MARK: Fire (§2)
    public static let tapMaxDuration: Double = 0.140   // s
    public static let tapMaxTravel: Double = 10        // pt
    public static let holdToFireDelay: Double = 0.150  // s inside dead zone
    public static let fireRate: Double = 3.5           // tracers / s
    public static var fireInterval: Double { 1.0 / fireRate }

    // MARK: Lives (§3)
    public static let startingLives: Int = 3
    public static let maxReserveLives: Int = 5
    public static let firstExtraLifeScore: Int = 10_000
    public static let extraLifeInterval: Int = 25_000
    public static let respawnDelay: Double = 1.2       // time to feel the hit before the respawn
    public static let respawnFlicker: Double = 1.5
    public static let hitStop: Double = 0.150

    // MARK: Fuel (§3)
    public static let fuelTank: Double = 100
    public static let fuelDrainBase: Double = 3.6      // units/s, band 1, speed-independent
    public static let fuelFillSlow: Double = 36        // units/s over a Lantern
    public static let fuelFillCruise: Double = 24
    public static let fuelFillFast: Double = 16
    public static let lowFuelThreshold: Double = 25
    public static let lanternLength: Double = 120      // pt
    public static let lanternWidth: Double = 40

    // MARK: Weirs (§3)
    public static let weirSpanMinimum: Double = 72           // pt
    public static let weirSpanChannelFactor: Double = 1.5    // × minChannel
    public static let hazardFreeAfterWeir: Double = 240      // pt
    public static let hazardFreeAroundLantern: Double = 150  // pt

    // MARK: Scoring (§3)
    public static let scoreHulk: Int = 60
    public static let scoreDragonfly: Int = 100
    public static let scoreMine: Int = 30
    public static let scoreChainDetonationBonus: Int = 60   // whole chain = 30 × n + 60
    public static let scoreLantern: Int = 80
    public static let scoreWeir: Int = 200
    public static let scoreGraze: Int = 25

    // MARK: Graze chain (§3)
    public static let grazeDistance: Double = 12        // pt from a kill-edge
    public static let grazeTime: Double = 0.20          // s continuous
    public static let grazeCooldown: Double = 0.5       // s per edge
    public static let chainStepMultiplier: Double = 0.25
    public static let chainCap: Int = 12                // M = 1 + 0.25 × min(chain, 12)
    public static let chainDecayDelay: Double = 3.0     // s without a graze
    public static let chainDecayPerSecond: Double = 1.0 // chain −1 per second after that

    // MARK: Hazard sizes & behaviour (§3, §5)
    public static let hulkSize: (width: Double, length: Double) = (36, 110)
    public static let dragonflySize: Double = 40
    public static let dragonflyDashDistance: Double = 120   // pt sideways
    public static let dragonflyDashSpeed: Double = 180      // pt/s
    public static let dragonflyFireTelegraph: Double = 0.4  // s rotor flash
    public static let dragonflyTracerSpeed: Double = 350    // pt/s
    public static let mineDiameter: Double = 18
    // The doc gives mine size and count but no cable length; the chain radius is
    // derived so that n mines spaced one diameter apart plus a gap fit on the cable.
    public static let teethMineSpacing: Double = 24          // pt between mine centres along the cable
    public static let pilingDiameter: Double = 16
    public static let pilingsPerGroup: ClosedRange<Int> = 2...4
    public static let pilingBankOffset: Double = 24         // within 24 pt of a bank / island tip

    // MARK: Tightening (§3, per Weir, additive on base, cap at gate 15)
    public static let tighteningCapGate: Int = 15
    public static let tightenCruisePerWeir: Double = 0.03
    public static let tightenSteerPerWeir: Double = 0.02
    public static let tightenDrainPerWeir: Double = 0.02
    public static let tightenMinChannelPerWeir: Double = -0.02
    public static let tightenLanternGapPerWeir: Double = 0.04
    public static let tightenHazardGapPerWeir: Double = -0.03

    public static func tightened(weirsCleared: Int) -> Tightened {
        let g = Double(min(max(weirsCleared, 0), tighteningCapGate))
        return Tightened(
            gate: Int(g),
            cruiseSpeed: cruiseSpeedBase * (1 + tightenCruisePerWeir * g),
            steerRate: steerRateBase * (1 + tightenSteerPerWeir * g),
            fuelDrain: fuelDrainBase * (1 + tightenDrainPerWeir * g),
            minChannelScale: 1 + tightenMinChannelPerWeir * g,
            lanternGapScale: 1 + tightenLanternGapPerWeir * g,
            hazardGapScale: 1 + tightenHazardGapPerWeir * g
        )
    }

    // MARK: River generator (§4)
    public static let reachLength: Double = 600
    public static let reachesAhead: Int = 4
    public static let bankMarginFraction: Double = 0.06       // banks within 6%…94%
    public static let widthChangeMaxPerReach: Double = 0.20
    public static let islandLengthRange: ClosedRange<Double> = 0.5...1.2   // × L
    public static let islandWidthRange: ClosedRange<Double> = 0.15...0.35  // × W
    public static let splitNarrowBranchFactor: Double = 0.80  // narrower branch 20% narrower
    public static let hazardGapJitter: Double = 0.30
    public static let lanternGapJitter: Double = 0.20
    public static let lanternGapHardCap: Double = 1.6         // × mean
    public static let openingLength: Double = 1800
    public static let openingWidth: Double = 0.78             // × screen width
    public static let openingLanterns: Int = 2
    public static let corridorWidthFactor: Double = 2.2       // × craft width
    public static var corridorWidth: Double { corridorWidthFactor * craftWidth } // 61.6
    public static let corridorStepY: Double = 20
    public static let hazardRerollLimit: Int = 20

    // MARK: Daily modifiers (§4)
    public static let dailyModifierCount: Int = 6
    public static let narrowsWidthScale: Double = 0.88          // all widths −12%
    public static let thinLanternsSpacingScale: Double = 1.25   // +25%
    public static let thinLanternsFillScale: Double = 1.20      // +20%
    public static let currentCruiseScale: Double = 1.10
    public static let currentSteerScale: Double = 1.10
    public static let longTeethMines: ClosedRange<Int> = 5...7

    // MARK: Bands (§5)
    public static let bands: [Band] = [
        Band(index: 1, name: "The Wide Reach", weirsCleared: 0...3,
             widthMin: 0.55, widthMax: 0.78, bend: 0.12, controlPointsPerReach: 1,
             minChannel: 70, islandProbability: 0.15, splitProbability: 0.0,
             pilingGroups: 0...0, hazardMeanGap: 420, hazardWeights: [70, 0, 30],
             hulkDrifts: false, hulkDrift: 0...0,
             dragonflyDashes: false, dragonflyDashCadence: 1.2...2.0,
             dragonflyFires: false, dragonflyFireInterval: 0,
             teethMines: 3...3, teethPivotDegPerSec: 10,
             lanternMeanGap: 900, weirGap: 2400, lighting: .blueNight),
        Band(index: 2, name: "Levees", weirsCleared: 4...7,
             widthMin: 0.45, widthMax: 0.70, bend: 0.16, controlPointsPerReach: 1,
             minChannel: 64, islandProbability: 0.25, splitProbability: 0.05,
             pilingGroups: 0...1, hazardMeanGap: 360, hazardWeights: [50, 20, 30],
             hulkDrifts: false, hulkDrift: 0...0,
             dragonflyDashes: true, dragonflyDashCadence: 1.2...2.0,
             dragonflyFires: false, dragonflyFireInterval: 0,
             teethMines: 3...4, teethPivotDegPerSec: 15,
             lanternMeanGap: 1050, weirGap: 2600, lighting: .blueNight),
        Band(index: 3, name: "Drift", weirsCleared: 8...12,
             widthMin: 0.38, widthMax: 0.62, bend: 0.22, controlPointsPerReach: 1,
             minChannel: 58, islandProbability: 0.35, splitProbability: 0.15,
             pilingGroups: 0...2, hazardMeanGap: 300, hazardWeights: [40, 25, 35],
             hulkDrifts: true, hulkDrift: 40...60,
             dragonflyDashes: true, dragonflyDashCadence: 1.2...1.2,
             dragonflyFires: false, dragonflyFireInterval: 0,
             teethMines: 4...5, teethPivotDegPerSec: 20,
             lanternMeanGap: 1250, weirGap: 2800, lighting: .amberDusk),
        Band(index: 4, name: "Narrows", weirsCleared: 13...18,
             widthMin: 0.30, widthMax: 0.52, bend: 0.26, controlPointsPerReach: 2,
             minChannel: 52, islandProbability: 0.45, splitProbability: 0.25,
             pilingGroups: 1...2, hazardMeanGap: 240, hazardWeights: [30, 35, 35],
             hulkDrifts: true, hulkDrift: 60...80,
             dragonflyDashes: true, dragonflyDashCadence: 1.2...1.2,
             dragonflyFires: true, dragonflyFireInterval: 2.5,
             teethMines: 5...6, teethPivotDegPerSec: 25,
             lanternMeanGap: 1450, weirGap: 3000, lighting: .amberDusk),
        Band(index: 5, name: "Blackwater", weirsCleared: 19...Int.max,
             widthMin: 0.26, widthMax: 0.44, bend: 0.30, controlPointsPerReach: 2,
             minChannel: 48, islandProbability: 0.55, splitProbability: 0.30,
             pilingGroups: 1...2, hazardMeanGap: 190, hazardWeights: [25, 40, 35],
             hulkDrifts: true, hulkDrift: 70...90,
             dragonflyDashes: true, dragonflyDashCadence: 1.2...1.2,
             dragonflyFires: true, dragonflyFireInterval: 1.8,
             teethMines: 5...7, teethPivotDegPerSec: 30,
             lanternMeanGap: 1700, weirGap: 3000, lighting: .fogGray),
    ]

    /// Band for a count of Weirs cleared. The table says band 1 is "Weirs 1–3";
    /// before the first Weir is cleared (0) the player is also in band 1.
    public static func band(forWeirsCleared n: Int) -> Band {
        let clamped = max(0, n)
        for b in bands where b.weirsCleared.contains(clamped) {
            return b
        }
        return bands[bands.count - 1]
    }

    // MARK: Pacing sanity (§5, not used by code but kept for reference)
    public static let warningSecondsBand1Cruise: Double = 2.3
    public static let warningSecondsBand5Fast: Double = 1.0
}
