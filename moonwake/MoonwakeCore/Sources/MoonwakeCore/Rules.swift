// Run rules (design §2, §3): fuel, score, chain, lives, input and craft motion.
// Pure value types; the scene layer owns time and collision detection and
// calls into these.

import Foundation

// MARK: - Run state

public enum DeathCause: Equatable, Sendable {
    case bank, island, piling, hulk, dragonfly, mine, weirWall, dragonflyTracer, fuel
    /// Terrain kills even during the respawn flicker (§3).
    public var isTerrain: Bool {
        switch self {
        case .bank, .island, .piling, .weirWall: return true
        default: return false
        }
    }
}

public enum DeathOutcome: Equatable, Sendable {
    case respawn
    case runOver
}

public enum KillKind: Equatable, Sendable {
    case hulk
    case dragonfly
    case mine
    case teethChain(mines: Int)   // anchor buoy hit: whole chain detonates
    case lantern

    public var basePoints: Int {
        switch self {
        case .hulk: return Tuning.scoreHulk
        case .dragonfly: return Tuning.scoreDragonfly
        case .mine: return Tuning.scoreMine
        case .teethChain(let n): return Tuning.scoreMine * n + Tuning.scoreChainDetonationBonus
        case .lantern: return Tuning.scoreLantern
        }
    }
}

public struct RunState: Equatable, Sendable {
    public var score: Int = 0
    /// Lives remaining including the craft in play (3 at start).
    public var lives: Int = Tuning.startingLives
    /// Extra lives earned from score, capped at `Tuning.maxReserveLives`.
    public var reserveLives: Int = 0
    public var fuel: Double = Tuning.fuelTank
    public var chain: Int = 0
    public var chainPeak: Int = 0
    public var weirsCleared: Int = 0
    public var nextExtraLifeScore: Int = Tuning.firstExtraLifeScore
    /// Along-river distance of the craft in points.
    public var distance: Double = 0
    /// Respawn point: the last cleared Weir (or run start).
    public var respawnY: Double = 0
    public var craftX: Double = Tuning.referenceWidth / 2
    public var speedBlend: Double = Tuning.cruiseMultiplier
    public var timeSinceGraze: Double = 0
    public var chainDecayAccumulator: Double = 0
    public var deaths: Int = 0
    public var lastDeath: DeathCause? = nil

    public init() {}

    public var totalLives: Int { lives + reserveLives }
    public var isLowFuel: Bool { fuel < Tuning.lowFuelThreshold }
}

public struct FuelResult: Equatable, Sendable {
    public var drained: Double
    public var filled: Double
    public var ranOut: Bool
}

// MARK: - Rules engine

public struct RulesEngine: Sendable {
    public let modifier: DailyModifier?

    public init(modifier: DailyModifier? = nil) {
        self.modifier = modifier
    }

    /// Tightened speeds/drain for the state's Weir count (Current modifier applied).
    public func tightened(for state: RunState) -> Tightened {
        let t = Tuning.tightened(weirsCleared: state.weirsCleared)
        guard let m = modifier, m == .current else { return t }
        return Tightened(gate: t.gate, cruiseSpeed: t.cruiseSpeed * m.cruiseScale,
                         steerRate: t.steerRate * m.steerScale, fuelDrain: t.fuelDrain,
                         minChannelScale: t.minChannelScale, lanternGapScale: t.lanternGapScale,
                         hazardGapScale: t.hazardGapScale)
    }

    /// `M = 1 + 0.25 × min(chain, 12)`.
    public static func chainMultiplier(chain: Int) -> Double {
        1 + Tuning.chainStepMultiplier * Double(min(max(chain, 0), Tuning.chainCap))
    }

    public func chainMultiplier(_ state: RunState) -> Double {
        RulesEngine.chainMultiplier(chain: state.chain)
    }

    /// Fill rate while overlapping a Lantern: 36/s slow, 24/s cruise, 16/s fast,
    /// interpolated with the speed blend.
    public func fuelFillRate(speedBlend: Double) -> Double {
        let b = RiverMath.clamp(speedBlend, Tuning.slowMultiplier, Tuning.fastMultiplier)
        let rate: Double
        if b <= Tuning.cruiseMultiplier {
            let t = (b - Tuning.slowMultiplier) / (Tuning.cruiseMultiplier - Tuning.slowMultiplier)
            rate = Tuning.fuelFillSlow + (Tuning.fuelFillCruise - Tuning.fuelFillSlow) * t
        } else {
            let t = (b - Tuning.cruiseMultiplier) / (Tuning.fastMultiplier - Tuning.cruiseMultiplier)
            rate = Tuning.fuelFillCruise + (Tuning.fuelFillFast - Tuning.fuelFillCruise) * t
        }
        return rate * (modifier?.fuelFillScale ?? 1)
    }

    /// Drains fuel (speed-independent) and fills it while over a Lantern.
    @discardableResult
    public func applyFuel(_ state: inout RunState, dt: Double, overlappingLantern: Bool, speedBlend: Double) -> FuelResult {
        let drained = tightened(for: state).fuelDrain * dt
        let filled = overlappingLantern ? fuelFillRate(speedBlend: speedBlend) * dt : 0
        var fuel = state.fuel - drained + filled
        var ranOut = false
        if fuel <= 0 {
            fuel = 0
            ranOut = true
        }
        state.fuel = min(fuel, Tuning.fuelTank)
        return FuelResult(drained: drained, filled: filled, ranOut: ranOut)
    }

    private func addScore(_ state: inout RunState, base: Int) -> Int {
        let points = Int((Double(base) * chainMultiplier(state)).rounded())
        state.score += points
        return points
    }

    /// Destroyed hazard (or Lantern). Returns the points awarded.
    @discardableResult
    public func awardKill(_ state: inout RunState, kind: KillKind) -> Int {
        addScore(&state, base: kind.basePoints)
    }

    /// Graze: chain +1, then +25 × multiplier.
    @discardableResult
    public func awardGraze(_ state: inout RunState) -> Int {
        state.chain += 1
        state.chainPeak = max(state.chainPeak, state.chain)
        state.timeSinceGraze = 0
        state.chainDecayAccumulator = 0
        return addScore(&state, base: Tuning.scoreGraze)
    }

    /// Passing a Weir: +200 × multiplier, respawn point moves, tightening step.
    @discardableResult
    public func awardWeir(_ state: inout RunState, atY y: Double) -> Int {
        state.weirsCleared += 1
        state.respawnY = y
        return addScore(&state, base: Tuning.scoreWeir)
    }

    /// A tracer left the top of the screen without hitting anything.
    public func tracerMissed(_ state: inout RunState) {
        state.chain = 0
        state.chainDecayAccumulator = 0
    }

    /// Chain decay: after 3 s without a graze the chain drops 1 per second.
    public func tick(_ state: inout RunState, dt: Double) {
        guard dt > 0 else { return }
        state.timeSinceGraze += dt
        guard state.chain > 0, state.timeSinceGraze > Tuning.chainDecayDelay else { return }
        // Only the part of dt past the delay counts toward decay.
        let overshoot = min(dt, state.timeSinceGraze - Tuning.chainDecayDelay)
        state.chainDecayAccumulator += overshoot * Tuning.chainDecayPerSecond
        while state.chainDecayAccumulator >= 1 && state.chain > 0 {
            state.chainDecayAccumulator -= 1
            state.chain -= 1
        }
    }

    /// Grants reserve lives at 10,000 then every 25,000. Returns how many were granted.
    @discardableResult
    public func extraLifeCheck(_ state: inout RunState) -> Int {
        var granted = 0
        while state.score >= state.nextExtraLifeScore {
            state.nextExtraLifeScore += Tuning.extraLifeInterval
            if state.reserveLives < Tuning.maxReserveLives {
                state.reserveLives += 1
                granted += 1
            }
        }
        return granted
    }

    /// Death: chain to 0, a life is consumed (reserve first). On respawn the
    /// tank is full and the craft returns to the last cleared Weir.
    public func die(_ state: inout RunState, cause: DeathCause) -> DeathOutcome {
        state.chain = 0
        state.chainDecayAccumulator = 0
        state.deaths += 1
        state.lastDeath = cause
        if state.reserveLives > 0 {
            state.reserveLives -= 1
        } else {
            state.lives -= 1
        }
        if state.lives <= 0 {
            state.lives = 0
            return .runOver
        }
        state.fuel = Tuning.fuelTank
        state.distance = state.respawnY
        state.speedBlend = Tuning.cruiseMultiplier
        state.craftX = Tuning.referenceWidth / 2
        return .respawn
    }
}

// MARK: - Input

/// Screen point in points; y grows downward (UIKit convention), so a thumb
/// displaced "down" has a larger y than the anchor.
public struct Point: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }
    public func distance(to p: Point) -> Double { ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y)).squareRoot() }
}

public struct InputOutput: Equatable, Sendable {
    /// −1 ... 1, linear from the dead-zone edge to full deflection.
    public var steer: Double
    /// Speed blend target: 0.6 slow, 1.0 cruise, 1.6 fast.
    public var throttleTarget: Double
    /// True at most once per fire interval.
    public var fireRequested: Bool
}

/// Relative one-thumb control (§2): anchor at touch-down, steer by horizontal
/// displacement, throttle by vertical displacement, fire by tap or hold-still.
public struct InputModel: Equatable, Sendable {
    public var deadZone: Double = Tuning.steerDeadZone
    public var fullDeflection: Double = Tuning.steerFullDeflection
    public var verticalDeadZone: Double = Tuning.throttleVerticalDeadZone
    public var throttleDisplacement: Double = Tuning.throttleFullDisplacement
    public var secondFingerDown: Bool = false

    public private(set) var anchor: Point? = nil
    public private(set) var current: Point? = nil
    private var touchStartTime: Double = 0
    private var maxTravel: Double = 0
    private var deadZoneEntryTime: Double? = nil
    private var tapPending: Bool = false
    private var nextFireTime: Double = -Double.infinity

    public init() {}

    public var isTouching: Bool { anchor != nil }

    public mutating func touchBegan(at p: Point, time: Double) {
        anchor = p
        current = p
        touchStartTime = time
        maxTravel = 0
        deadZoneEntryTime = time
    }

    public mutating func touchMoved(to p: Point, time: Double) {
        guard let a = anchor else { return }
        current = p
        let d = a.distance(to: p)
        maxTravel = max(maxTravel, d)
        if d <= deadZone {
            if deadZoneEntryTime == nil { deadZoneEntryTime = time }
        } else {
            deadZoneEntryTime = nil   // auto-fire stops immediately
        }
    }

    public mutating func touchEnded(at p: Point, time: Double) {
        if let a = anchor {
            let travel = max(maxTravel, a.distance(to: p))
            if time - touchStartTime < Tuning.tapMaxDuration && travel < Tuning.tapMaxTravel {
                tapPending = true
            }
        }
        anchor = nil
        current = nil
        deadZoneEntryTime = nil
    }

    public var steerCommand: Double {
        guard let a = anchor, let c = current else { return 0 }
        let dx = c.x - a.x
        let mag = abs(dx)
        guard mag > deadZone else { return 0 }
        let t = min(1, (mag - deadZone) / (fullDeflection - deadZone))
        return dx < 0 ? -t : t
    }

    public var throttleTarget: Double {
        if secondFingerDown { return Tuning.fastMultiplier }
        guard let a = anchor, let c = current else { return Tuning.cruiseMultiplier }
        let dy = c.y - a.y   // positive = down = slow
        let mag = abs(dy)
        guard mag > verticalDeadZone else { return Tuning.cruiseMultiplier }
        let t = min(1, (mag - verticalDeadZone) / (throttleDisplacement - verticalDeadZone))
        let target = dy > 0 ? Tuning.slowMultiplier : Tuning.fastMultiplier
        return Tuning.cruiseMultiplier + (target - Tuning.cruiseMultiplier) * t
    }

    public mutating func update(time: Double) -> InputOutput {
        var fire = false
        let interval = Tuning.fireInterval
        var wants = false
        if tapPending {
            wants = true
        } else if let entry = deadZoneEntryTime, anchor != nil, time - entry >= Tuning.holdToFireDelay {
            wants = true
        }
        if wants && time >= nextFireTime {
            fire = true
            tapPending = false
            // Keep an exact cadence while holding; restart it after an idle gap.
            nextFireTime = nextFireTime + interval >= time ? nextFireTime + interval : time + interval
        }
        return InputOutput(steer: steerCommand, throttleTarget: throttleTarget, fireRequested: fire)
    }
}

// MARK: - Craft motion

/// Integrates lateral velocity with the 70 ms first-order lag and the speed
/// blend with the 600 pt/s² acceleration.
public struct CraftMotion: Equatable, Sendable {
    public var x: Double = Tuning.referenceWidth / 2
    public var lateralVelocity: Double = 0
    public var speedBlend: Double = Tuning.cruiseMultiplier

    public init() {}
    public init(x: Double, speedBlend: Double = Tuning.cruiseMultiplier) {
        self.x = x
        self.speedBlend = speedBlend
    }

    public func scrollSpeed(cruise: Double) -> Double { speedBlend * cruise }

    /// Lean angle in degrees from lateral velocity (±14° at full steer rate).
    public func leanDegrees(steerRate: Double) -> Double {
        RiverMath.clamp(lateralVelocity / steerRate, -1, 1) * Tuning.maxLeanDegrees
    }

    /// Advances one frame. Returns the along-river distance travelled.
    @discardableResult
    public mutating func update(dt: Double, steer: Double, throttleTarget: Double, steerRate: Double, cruiseSpeed: Double) -> Double {
        guard dt > 0 else { return 0 }
        let targetV = RiverMath.clamp(steer, -1, 1) * steerRate
        let alpha = 1 - exp(-dt / Tuning.lateralTimeConstant)
        lateralVelocity += (targetV - lateralVelocity) * alpha
        x += lateralVelocity * dt

        let target = RiverMath.clamp(throttleTarget, Tuning.slowMultiplier, Tuning.fastMultiplier)
        let maxStep = Tuning.speedBlendAcceleration / cruiseSpeed * dt
        let delta = target - speedBlend
        speedBlend += RiverMath.clamp(delta, -maxStep, maxStep)
        return scrollSpeed(cruise: cruiseSpeed) * dt
    }
}
