import XCTest
@testable import MoonwakeCore

final class RulesTests: XCTestCase {
    let engine = RulesEngine()

    // MARK: Fuel

    /// Gross fill from one pass over a 120 pt Lantern at the given speed blend.
    private func fillOverLantern(speedBlend: Double, modifier: DailyModifier? = nil) -> (filled: Double, drained: Double) {
        let engine = RulesEngine(modifier: modifier)
        var state = RunState()
        state.fuel = 50
        let speed = Tuning.cruiseSpeedBase * speedBlend
        let duration = Tuning.lanternLength / speed
        let dt = 1.0 / 60.0
        var t = 0.0, filled = 0.0, drained = 0.0
        while t < duration - 1e-9 {
            let step = min(dt, duration - t)
            let r = engine.applyFuel(&state, dt: step, overlappingLantern: true, speedBlend: speedBlend)
            filled += r.filled
            drained += r.drained
            t += step
        }
        return (filled, drained)
    }

    func testFuelEquilibriumNumbersFromDesign() {
        let cruise = fillOverLantern(speedBlend: Tuning.cruiseMultiplier)
        XCTAssertEqual(cruise.filled, 11.08, accuracy: 1.108)      // 24/s × 120/260
        let slow = fillOverLantern(speedBlend: Tuning.slowMultiplier)
        XCTAssertEqual(slow.filled, 27.7, accuracy: 2.77)          // 36/s × 120/156
        let fast = fillOverLantern(speedBlend: Tuning.fastMultiplier)
        XCTAssertEqual(fast.filled, 4.6, accuracy: 0.46)           // 16/s × 120/416
        // Drain is speed independent: 3.6/s for the pass duration.
        XCTAssertEqual(cruise.drained, 3.6 * 120 / 260, accuracy: 0.01)
        // Cruising between Lanterns 900 pt apart drains 3.6 × 900/260 ≈ 12.5, so a
        // cruising pass roughly breaks even (−1.4), per the doc.
        let betweenLanterns = 3.6 * Tuning.bands[0].lanternMeanGap / Tuning.cruiseSpeedBase
        XCTAssertEqual(cruise.filled - betweenLanterns, 0, accuracy: 2)
        // Thin Lanterns: fill +20%.
        XCTAssertEqual(fillOverLantern(speedBlend: 1.0, modifier: .thinLanterns).filled, 11.08 * 1.2, accuracy: 0.5)
    }

    func testFuelDrainAndEmptyTank() {
        var state = RunState()
        let r = engine.applyFuel(&state, dt: 1, overlappingLantern: false, speedBlend: 1.6)
        XCTAssertEqual(r.drained, 3.6, accuracy: 1e-9)
        XCTAssertEqual(state.fuel, 96.4, accuracy: 1e-9)
        XCTAssertFalse(r.ranOut)
        state.fuel = 1
        let empty = engine.applyFuel(&state, dt: 1, overlappingLantern: false, speedBlend: 1)
        XCTAssert(empty.ranOut)
        XCTAssertEqual(state.fuel, 0)
        // Tank never exceeds 100.
        state.fuel = 99.9
        engine.applyFuel(&state, dt: 1, overlappingLantern: true, speedBlend: 0.6)
        XCTAssertEqual(state.fuel, 100)
        // Tightened drain: +2% per weir.
        state.weirsCleared = 5
        state.fuel = 100
        let tightened = engine.applyFuel(&state, dt: 1, overlappingLantern: false, speedBlend: 1)
        XCTAssertEqual(tightened.drained, 3.6 * 1.10, accuracy: 1e-9)
    }

    func testFillRateInterpolation() {
        XCTAssertEqual(engine.fuelFillRate(speedBlend: 0.6), 36)
        XCTAssertEqual(engine.fuelFillRate(speedBlend: 1.0), 24)
        XCTAssertEqual(engine.fuelFillRate(speedBlend: 1.6), 16)
        XCTAssertEqual(engine.fuelFillRate(speedBlend: 0.8), 30)
        XCTAssertEqual(engine.fuelFillRate(speedBlend: 1.3), 20)
    }

    // MARK: Chain and score

    func testChainMultiplierCapsAtFour() {
        var state = RunState()
        XCTAssertEqual(engine.chainMultiplier(state), 1.0)
        for i in 1...20 {
            engine.awardGraze(&state)
            XCTAssertEqual(state.chain, i)
            XCTAssertEqual(engine.chainMultiplier(state), 1 + 0.25 * Double(min(i, 12)), accuracy: 1e-12)
        }
        XCTAssertEqual(engine.chainMultiplier(state), 4.0)
        XCTAssertEqual(RulesEngine.chainMultiplier(chain: 12), 4.0)
        XCTAssertEqual(RulesEngine.chainMultiplier(chain: 100), 4.0)
        XCTAssertEqual(state.chainPeak, 20)
        // Scores multiply by the chain at the time they are earned.
        let before = state.score
        XCTAssertEqual(engine.awardKill(&state, kind: .hulk), 240)
        XCTAssertEqual(state.score, before + 240)
        XCTAssertEqual(engine.awardKill(&state, kind: .teethChain(mines: 5)), (30 * 5 + 60) * 4)
    }

    func testScoreValues() {
        var state = RunState()
        XCTAssertEqual(engine.awardKill(&state, kind: .hulk), 60)
        XCTAssertEqual(engine.awardKill(&state, kind: .dragonfly), 100)
        XCTAssertEqual(engine.awardKill(&state, kind: .mine), 30)
        XCTAssertEqual(engine.awardKill(&state, kind: .teethChain(mines: 7)), 270)
        XCTAssertEqual(engine.awardKill(&state, kind: .lantern), 80)
        XCTAssertEqual(engine.awardWeir(&state, atY: 1800), 200)
        XCTAssertEqual(state.weirsCleared, 1)
        XCTAssertEqual(state.respawnY, 1800)
        XCTAssertEqual(engine.awardGraze(&state), Int((25.0 * 1.25).rounded()))
        XCTAssertEqual(state.score, 60 + 100 + 30 + 270 + 80 + 200 + 31)
    }

    func testChainBreaksAndDecays() {
        var state = RunState()
        for _ in 0..<5 { engine.awardGraze(&state) }
        engine.tracerMissed(&state)
        XCTAssertEqual(state.chain, 0)
        for _ in 0..<5 { engine.awardGraze(&state) }
        // No decay in the first 3 s.
        engine.tick(&state, dt: 2.9)
        XCTAssertEqual(state.chain, 5)
        engine.tick(&state, dt: 0.2)   // 3.1 s: 0.1 s of decay accrued
        XCTAssertEqual(state.chain, 5)
        engine.tick(&state, dt: 0.95)  // 1.05 s past the delay → −1
        XCTAssertEqual(state.chain, 4)
        engine.tick(&state, dt: 2.0)   // → −2 more
        XCTAssertEqual(state.chain, 2)
        engine.awardGraze(&state)      // resets the timer
        XCTAssertEqual(state.chain, 3)
        engine.tick(&state, dt: 2.5)
        XCTAssertEqual(state.chain, 3)
        engine.tick(&state, dt: 10)
        XCTAssertEqual(state.chain, 0)
    }

    // MARK: Lives

    func testExtraLifeAt10000And35000() {
        var state = RunState()
        state.score = 9_999
        XCTAssertEqual(engine.extraLifeCheck(&state), 0)
        state.score = 10_000
        XCTAssertEqual(engine.extraLifeCheck(&state), 1)
        XCTAssertEqual(state.reserveLives, 1)
        XCTAssertEqual(state.nextExtraLifeScore, 35_000)
        state.score = 34_999
        XCTAssertEqual(engine.extraLifeCheck(&state), 0)
        state.score = 35_000
        XCTAssertEqual(engine.extraLifeCheck(&state), 1)
        XCTAssertEqual(state.nextExtraLifeScore, 60_000)
        state.score = 85_000
        XCTAssertEqual(engine.extraLifeCheck(&state), 2)   // 60,000 and 85,000
        XCTAssertEqual(state.reserveLives, 4)
        XCTAssertEqual(state.nextExtraLifeScore, 110_000)
        // Reserve caps at 5.
        state.score = 1_000_000
        engine.extraLifeCheck(&state)
        XCTAssertEqual(state.reserveLives, Tuning.maxReserveLives)
    }

    func testDeathRespawnAndRunOver() {
        var state = RunState()
        state.fuel = 10
        state.distance = 5000
        state.respawnY = 4200
        state.chain = 7
        XCTAssertEqual(engine.die(&state, cause: .bank), .respawn)
        XCTAssertEqual(state.lives, 2)
        XCTAssertEqual(state.fuel, 100)
        XCTAssertEqual(state.distance, 4200)
        XCTAssertEqual(state.chain, 0)
        XCTAssertEqual(state.lastDeath, .bank)
        state.reserveLives = 1
        XCTAssertEqual(engine.die(&state, cause: .fuel), .respawn)
        XCTAssertEqual(state.reserveLives, 0)
        XCTAssertEqual(state.lives, 2)
        XCTAssertEqual(engine.die(&state, cause: .mine), .respawn)
        XCTAssertEqual(state.lives, 1)
        XCTAssertEqual(engine.die(&state, cause: .hulk), .runOver)
        XCTAssertEqual(state.lives, 0)
        XCTAssertEqual(state.deaths, 4)
        XCTAssert(DeathCause.piling.isTerrain)
        XCTAssertFalse(DeathCause.dragonflyTracer.isTerrain)
    }

    // MARK: Input

    func testTapFiresOnce() {
        var input = InputModel()
        var fires = 0
        input.touchBegan(at: Point(x: 100, y: 600), time: 0)
        var t = 0.0
        while t < 0.1 {
            t += 1.0 / 60
            if input.update(time: t).fireRequested { fires += 1 }
        }
        XCTAssertEqual(fires, 0, "no auto-fire before 150 ms")
        input.touchMoved(to: Point(x: 103, y: 602), time: 0.1)
        input.touchEnded(at: Point(x: 103, y: 602), time: 0.11)
        while t < 2.0 {
            t += 1.0 / 60
            if input.update(time: t).fireRequested { fires += 1 }
        }
        XCTAssertEqual(fires, 1)
        // A slow press or a long drag is not a tap.
        input.touchBegan(at: Point(x: 100, y: 600), time: 3.0)
        input.touchMoved(to: Point(x: 130, y: 600), time: 3.05)
        input.touchEnded(at: Point(x: 130, y: 600), time: 3.1)
        XCTAssertFalse(input.update(time: 3.11).fireRequested)
        input.touchBegan(at: Point(x: 100, y: 600), time: 4.0)
        input.touchMoved(to: Point(x: 100, y: 660), time: 4.02)  // left dead zone → no auto-fire
        input.touchEnded(at: Point(x: 100, y: 600), time: 4.3)
        XCTAssertFalse(input.update(time: 4.31).fireRequested)
    }

    func testHoldStillAutoFiresAtFireRate() {
        var input = InputModel()
        input.touchBegan(at: Point(x: 100, y: 600), time: 0)
        var fires = 0
        var firstFire: Double? = nil
        var t = 0.0
        while t < 10 {
            t += 1.0 / 60
            if input.update(time: t).fireRequested {
                fires += 1
                if firstFire == nil { firstFire = t }
            }
        }
        XCTAssertNotNil(firstFire)
        XCTAssertEqual(firstFire!, Tuning.holdToFireDelay, accuracy: 1.0 / 60 + 1e-9)
        let expected = 1 + Int((10 - Tuning.holdToFireDelay) * Tuning.fireRate)   // 35
        XCTAssertEqual(fires, expected, accuracy: 1)
        XCTAssertEqual(Double(fires) / 10, Tuning.fireRate, accuracy: 0.2)
    }

    func testLeavingDeadZoneStopsFireAndRearms() {
        var input = InputModel()
        input.touchBegan(at: Point(x: 100, y: 600), time: 0)
        var t = 0.0
        var fires = 0
        while t < 1.0 {
            t += 1.0 / 60
            if input.update(time: t).fireRequested { fires += 1 }
        }
        XCTAssertGreaterThan(fires, 2)
        input.touchMoved(to: Point(x: 120, y: 600), time: t)   // steering
        fires = 0
        while t < 2.0 {
            t += 1.0 / 60
            let out = input.update(time: t)
            if out.fireRequested { fires += 1 }
            XCTAssertGreaterThan(out.steer, 0)
        }
        XCTAssertEqual(fires, 0, "steering silences the gun")
        // Return to the dead zone: re-arms 150 ms later.
        input.touchMoved(to: Point(x: 101, y: 600), time: t)
        let returned = t
        var firstFire: Double? = nil
        while t < 3.0 {
            t += 1.0 / 60
            if input.update(time: t).fireRequested && firstFire == nil { firstFire = t }
        }
        XCTAssertNotNil(firstFire)
        XCTAssertEqual(firstFire! - returned, Tuning.holdToFireDelay, accuracy: 1.0 / 60 + 1e-9)
    }

    func testSteerCurve() {
        var input = InputModel()
        input.touchBegan(at: Point(x: 200, y: 600), time: 0)
        XCTAssertEqual(input.steerCommand, 0)
        input.touchMoved(to: Point(x: 205, y: 600), time: 0.1)
        XCTAssertEqual(input.steerCommand, 0, "inside the 6 pt dead zone")
        input.touchMoved(to: Point(x: 227, y: 600), time: 0.2)   // 27 pt: halfway from 6 to 48
        XCTAssertEqual(input.steerCommand, 0.5, accuracy: 1e-9)
        input.touchMoved(to: Point(x: 248, y: 600), time: 0.3)
        XCTAssertEqual(input.steerCommand, 1.0, accuracy: 1e-9)
        input.touchMoved(to: Point(x: 300, y: 600), time: 0.4)
        XCTAssertEqual(input.steerCommand, 1.0, "clamped beyond full deflection")
        input.touchMoved(to: Point(x: 152, y: 600), time: 0.5)
        XCTAssertEqual(input.steerCommand, -1.0, accuracy: 1e-9)
        input.touchEnded(at: Point(x: 152, y: 600), time: 0.6)
        XCTAssertEqual(input.steerCommand, 0)
    }

    func testThrottleThresholds() {
        var input = InputModel()
        XCTAssertEqual(input.throttleTarget, 1.0, "no touch → cruise")
        input.touchBegan(at: Point(x: 200, y: 600), time: 0)
        XCTAssertEqual(input.throttleTarget, 1.0)
        input.touchMoved(to: Point(x: 230, y: 620), time: 0.1)   // 20 pt down: inside ±24 → cruise
        XCTAssertEqual(input.throttleTarget, 1.0)
        input.touchMoved(to: Point(x: 200, y: 640), time: 0.2)   // 40 pt down → slow
        XCTAssertEqual(input.throttleTarget, 0.6, accuracy: 1e-9)
        input.touchMoved(to: Point(x: 200, y: 700), time: 0.3)   // further → still slow
        XCTAssertEqual(input.throttleTarget, 0.6, accuracy: 1e-9)
        input.touchMoved(to: Point(x: 200, y: 560), time: 0.4)   // 40 pt up → fast
        XCTAssertEqual(input.throttleTarget, 1.6, accuracy: 1e-9)
        input.touchMoved(to: Point(x: 200, y: 568), time: 0.5)   // 32 pt up: halfway → 1.3
        XCTAssertEqual(input.throttleTarget, 1.3, accuracy: 1e-9)
        input.touchMoved(to: Point(x: 200, y: 600), time: 0.6)
        input.secondFingerDown = true
        XCTAssertEqual(input.throttleTarget, 1.6)
        input.secondFingerDown = false
        XCTAssertEqual(input.throttleTarget, 1.0)
        let out = input.update(time: 0.7)
        XCTAssertEqual(out.throttleTarget, 1.0)
    }

    // MARK: Craft motion

    func testLateralLagReaches95PercentIn200ms() {
        var craft = CraftMotion()
        var t = 0.0
        while t < 0.2 - 1e-9 {
            craft.update(dt: 1.0 / 120, steer: 1, throttleTarget: 1, steerRate: 300, cruiseSpeed: 260)
            t += 1.0 / 120
        }
        XCTAssertEqual(craft.lateralVelocity / 300, 0.943, accuracy: 0.02)   // 1 − e^(−0.2/0.07)
        XCTAssertGreaterThan(craft.x, Tuning.referenceWidth / 2)
        XCTAssertEqual(craft.leanDegrees(steerRate: 300), 14 * 0.943, accuracy: 0.5)
    }

    func testSpeedBlendAccelerationSlowToFastTakesAboutHalfSecond() {
        var craft = CraftMotion(x: 195, speedBlend: 0.6)
        var t = 0.0
        while craft.speedBlend < 1.6 - 1e-9 {
            craft.update(dt: 1.0 / 60, steer: 0, throttleTarget: 1.6, steerRate: 300, cruiseSpeed: 260)
            t += 1.0 / 60
            XCTAssertLessThan(t, 2)
        }
        XCTAssertEqual(t, 0.433, accuracy: 0.03)   // (1.6 − 0.6) × 260 / 600
        XCTAssertEqual(craft.scrollSpeed(cruise: 260), 416, accuracy: 1e-6)
        let advanced = craft.update(dt: 0.5, steer: 0, throttleTarget: 1.6, steerRate: 300, cruiseSpeed: 260)
        XCTAssertEqual(advanced, 208, accuracy: 1e-6)
    }
}
