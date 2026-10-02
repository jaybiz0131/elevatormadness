import UIKit

/// Haptic vocabulary from the design document, on UIKit feedback generators.
/// Kept tiny on purpose: no CoreHaptics patterns in v1.
final class Haptics {
    static let shared = Haptics()
    var enabled = true

    private let light = UIImpactFeedbackGenerator(style: .light)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let notify = UINotificationFeedbackGenerator()
    private var lastFuelKnock: TimeInterval = 0
    private var lastLowFuel: TimeInterval = 0

    private init() { prepare() }

    func prepare() {
        light.prepare(); rigid.prepare(); soft.prepare(); heavy.prepare(); notify.prepare()
    }

    /// Light tick on a near-bank graze.
    func graze() { guard enabled else { return }; light.impactOccurred(intensity: 0.5) }
    /// Harder pulse on a kill.
    func kill() { guard enabled else { return }; rigid.impactOccurred(intensity: 0.9) }
    /// Soft knock every 0.25 s while fuel is skimming.
    func fuelSkim(now: TimeInterval) {
        guard enabled, now - lastFuelKnock >= 0.25 else { return }
        lastFuelKnock = now
        soft.impactOccurred(intensity: 0.35)
    }
    /// Soft knock every second while the gauge is red.
    func lowFuel(now: TimeInterval) {
        guard enabled, now - lastLowFuel >= 1.0 else { return }
        lastLowFuel = now
        soft.impactOccurred(intensity: 0.35)
    }
    func weirCleared() { guard enabled else { return }; notify.notificationOccurred(.success) }
    func death() { guard enabled else { return }; heavy.impactOccurred(intensity: 1.0) }
}
