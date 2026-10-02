import SpriteKit
import MoonwakeCore

/// The one scene. Owns the run: river generation, entities, collisions,
/// rules, input, camera and the v1 screens. Game logic lives in MoonwakeCore;
/// this file is the glue and the presentation.
final class GameScene: SKScene {

    // MARK: Phase

    private enum Phase { case attract, playing, dying, runOver, paused }
    private var phase: Phase = .attract
    private var phaseTimer: TimeInterval = 0
    private var pausedFrom: Phase = .playing

    // MARK: Logic

    private var generator: RiverGenerator
    private var river = River(reaches: [])
    private var rules: RulesEngine
    private var state = RunState()
    private var input = InputModel()
    private var motion = CraftMotion()
    private var seed: UInt64
    private var modifier: DailyModifier?
    private var dailyMode = false

    // MARK: Presentation

    private let world = SKNode()
    private var water: WaterNode!
    private let craft = CraftNode()
    private let hud = HUDNode()
    private var lighting = Lighting.state(.night)
    private var lightingTarget = Lighting.state(.night)
    private var lightingFrom = Lighting.state(.night)
    private var lightingBlend: Float = 1
    private var currentLightingState: LightingState = .blueNight
    var safeAreaInsets: UIEdgeInsets = .zero { didSet { hud.layout(size: size, insets: safeAreaInsets) } }

    // MARK: Entities

    private final class Entity {
        enum Kind { case hulk, dragonfly, teeth, lantern, weir, piling, lamp }
        let kind: Kind
        let reachIndex: Int
        var x: Double
        let y: Double
        let node: SKNode
        var alive = true
        // hulk
        var driftSpeed: Double = 0
        var driftDir: Double = 1
        // dragonfly
        var dashCadence: Double = 1.5
        var dashTimer: Double = 0
        var dashRemaining: Double = 0
        var dashDir: Double = 1
        var fires = false
        var fireInterval: Double = 0
        var fireTimer: Double = 0
        var telegraph: Double = 0
        // teeth
        var mineOffsets: [Double] = []
        var mineAlive: [Bool] = []
        var mineNodes: [SKNode] = []
        var angle: Double = 0
        var pivot: Double = 0
        // weir
        var weir: Weir?
        var passed = false

        init(kind: Kind, reachIndex: Int, x: Double, y: Double, node: SKNode) {
            self.kind = kind; self.reachIndex = reachIndex; self.x = x; self.y = y; self.node = node
        }
    }

    private struct Tracer {
        let node: SKNode
        var x: Double
        var y: Double
        var prevY: Double
        let enemy: Bool
    }

    private var entities: [Entity] = []
    private var tracers: [Tracer] = []
    private var builtReaches = Set<Int>()
    private var grazeTimers: [String: Double] = [:]       // edge id → continuous time near it
    private var grazeCooldowns: [String: TimeInterval] = [:]
    private var lastTime: TimeInterval = 0
    private var now: TimeInterval = 0
    private var flickerUntil: TimeInterval = 0
    private var lastDeathX: Double = Tuning.referenceWidth / 2
    private var hadRunBefore = false
    private var howToStep = 0
    private var primaryTouch: UITouch?
    private var secondTouch: UITouch?

    // MARK: Init

    override init(size: CGSize) {
        let s = UInt64.random(in: 1...UInt64.max)
        seed = s
        generator = RiverGenerator(seed: s, modifier: nil)
        rules = RulesEngine(modifier: nil)
        super.init(size: size)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func didMove(to view: SKView) {
        backgroundColor = UIColor(red: 0.016, green: 0.027, blue: 0.055, alpha: 1)
        water = WaterNode(size: size)
        addChild(water)
        addChild(world)
        craft.zPosition = 70
        world.addChild(craft)
        hud.layout(size: size, insets: safeAreaInsets)
        hud.onTap = { [weak self] name in self?.buttonTapped(name) }
        addChild(hud)
        Haptics.shared.enabled = SaveStore.shared.data.hapticsOn
        water.setSampler { [weak self] y in self?.profileSample(atY: Double(y)) ?? RiverProfileSample(centerX: 195, halfWidth: 150, islandX: 195, islandHalfWidth: 0, tipDist: -2048) }
        beginRun(newSeed: false)
        enterAttract()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        super.didChangeSize(oldSize)
        water?.resize(size)
        hud.layout(size: size, insets: safeAreaInsets)
    }

    // MARK: Run lifecycle

    private func beginRun(newSeed: Bool) {
        if newSeed {
            if dailyMode {
                let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
                let d = DailyModifier.forDate(f.string(from: Date()))
                seed = d.seed; modifier = d.modifier
            } else {
                seed = UInt64.random(in: 1...UInt64.max); modifier = nil
            }
        }
        generator = RiverGenerator(seed: seed, modifier: modifier)
        rules = RulesEngine(modifier: modifier)
        river = River(reaches: [])
        state = RunState()
        motion = CraftMotion()
        input = InputModel()
        for e in entities { e.node.removeFromParent() }
        entities.removeAll()
        for t in tracers { t.node.removeFromParent() }
        tracers.removeAll()
        builtReaches.removeAll()
        grazeTimers.removeAll(); grazeCooldowns.removeAll()
        howToStep = SaveStore.shared.data.howToSeen ? 99 : 0
        ensureReaches(through: 3000)
        motion.x = river.centerX(atY: 0)
        state.craftX = motion.x
        currentLightingState = generator.lighting(forWeirsCleared: 0)
        lighting = Lighting.state(map(currentLightingState))
        lightingTarget = lighting; lightingFrom = lighting; lightingBlend = 1
        water.setLighting(lighting)
        hud.setColor(lighting.hudColor)
        craft.setVisibleAlive(true)
        craft.flicker(until: 0)
        hud.hideCard()
        SaveStore.shared.update { $0.lastSeed = seed }
        if hadRunBefore { spawnWreckGhost() }
    }

    private func enterAttract() {
        phase = .attract
        hud.showCenter("TOUCH TO TAKE THE HELM", sub: dailyMode ? "DAILY RIVER · \(modifierName(modifier))" : "MOONWAKE")
    }

    private func startPlaying() {
        phase = .playing
        hud.hideCenter()
        SaveStore.shared.update { $0.runsPlayed += 1 }
        hadRunBefore = true
    }

    private func modifierName(_ m: DailyModifier?) -> String {
        switch m {
        case .narrows: return "NARROWS"
        case .blackout: return "BLACKOUT"
        case .thinLanterns: return "THIN LANTERNS"
        case .drift: return "DRIFT"
        case .current: return "CURRENT"
        case .longTeeth: return "LONG TEETH"
        case nil: return ""
        }
    }

    private func map(_ s: LightingState) -> Lighting.State {
        switch s {
        case .blueNight: return .night
        case .amberDusk: return .dusk
        case .fogGray: return .fog
        }
    }

    // MARK: River

    private func ensureReaches(through y: Double) {
        let needed = Int(floor(y / Tuning.reachLength)) + 1
        guard needed > river.reaches.count else { return }
        var rs = river.reaches
        for i in rs.count..<needed { rs.append(generator.reach(i)) }
        river = River(reaches: rs)
    }

    private func reach(atY y: Double) -> Reach? {
        ensureReaches(through: max(y, 0))
        return river.reach(atY: y)
    }

    /// Feeds the water shader. Island distance is a true 2-D distance near the
    /// tips so the shallow shelf wraps smoothly around them.
    private func profileSample(atY y: Double) -> RiverProfileSample {
        let yc = max(y, 0)
        guard let r = reach(atY: yc) else {
            return RiverProfileSample(centerX: 195, halfWidth: 150, islandX: 195, islandHalfWidth: 0, tipDist: -2048)
        }
        let c = r.centerX(atY: yc)
        let hw = r.width(atY: yc) / 2
        var islandX = c, ihw = 0.0, tip = -2048.0
        var best = Double.infinity
        var candidates = r.allIslands
        if let prev = river.reach(atY: yc - 400), prev.index != r.index { candidates += prev.allIslands }
        if let next = reach(atY: yc + 400), next.index != r.index { candidates += next.islands }
        for island in candidates {
            if island.covers(y: yc) {
                let span = river.islandSpan(island, atY: yc)
                islandX = (span.lowerBound + span.upperBound) / 2
                ihw = island.width / 2
                tip = min(yc - island.yStart, island.yEnd - yc)
                best = -1
                break
            }
            let dist = yc < island.yStart ? island.yStart - yc : yc - island.yEnd
            if dist < best && dist < 400 {
                best = dist
                let ty = yc < island.yStart ? island.yStart : island.yEnd
                let span = river.islandSpan(island, atY: ty)
                islandX = (span.lowerBound + span.upperBound) / 2
                ihw = 0
                tip = -dist
            }
        }
        return RiverProfileSample(centerX: Float(c), halfWidth: Float(hw), islandX: Float(islandX),
                                  islandHalfWidth: Float(ihw), tipDist: Float(tip))
    }

    // MARK: Entities

    private func buildEntities(for r: Reach) {
        guard !builtReaches.contains(r.index) else { return }
        builtReaches.insert(r.index)
        let band = Tuning.band(forWeirsCleared: r.weirsCleared)
        let ls = Double(size.width / 390)
        for h in r.hazards {
            switch h.kind {
            case .hulk(let drift):
                let e = Entity(kind: .hulk, reachIndex: r.index, x: h.x, y: h.y, node: PropNodes.hulk(lighting: lighting))
                e.driftSpeed = drift
                e.driftDir = h.id % 2 == 0 ? 1 : -1
                add(e)
            case .dragonfly(let fires, let cadence):
                let e = Entity(kind: .dragonfly, reachIndex: r.index, x: h.x, y: h.y, node: PropNodes.dragonfly())
                e.dashCadence = cadence
                e.dashTimer = cadence * 0.5
                e.fires = fires
                e.fireInterval = band.dragonflyFireInterval
                e.fireTimer = max(band.dragonflyFireInterval, 1.0) * 0.7
                add(e)
            case .teeth(let n, let pivot, _):
                let node = SKNode()
                let e = Entity(kind: .teeth, reachIndex: r.index, x: h.x, y: h.y, node: node)
                e.pivot = pivot * .pi / 180
                e.angle = Double(h.id % 7) * 0.9
                let half = Double(n - 1) / 2
                for k in 0..<n {
                    let off = (Double(k) - half) * Tuning.teethMineSpacing
                    e.mineOffsets.append(off)
                    e.mineAlive.append(true)
                    let m = PropNodes.mine()
                    m.position = CGPoint(x: off * ls, y: 0)
                    node.addChild(m)
                    e.mineNodes.append(m)
                }
                let cable = PropNodes.cable(from: CGPoint(x: -half * Tuning.teethMineSpacing * ls, y: 0),
                                            to: CGPoint(x: half * Tuning.teethMineSpacing * ls, y: 0))
                cable.zPosition = -0.2
                node.addChild(cable)
                node.addChild(PropNodes.anchorBuoy(lighting: lighting))
                add(e)
            }
        }
        for l in r.lanterns {
            add(Entity(kind: .lantern, reachIndex: r.index, x: l.x, y: l.y, node: PropNodes.lantern(lighting: lighting)))
        }
        if let w = r.weir {
            let c = r.centerX(atY: w.y)
            let left = (r.leftBankX(atY: w.y) - c) * ls, right = (r.rightBankX(atY: w.y) - c) * ls
            let node = PropNodes.weir(left: left, right: right, spanL: (w.spanLeftX - c) * ls, spanR: (w.spanRightX - c) * ls, lighting: lighting)
            let e = Entity(kind: .weir, reachIndex: r.index, x: c, y: w.y, node: node)
            e.weir = w
            add(e)
        }
        for g in r.pilings {
            for x in g.xs {
                add(Entity(kind: .piling, reachIndex: r.index, x: x, y: g.y, node: PropNodes.piling(lighting: lighting)))
            }
        }
        // levee lamps every 320 pt, alternating banks
        var y = ceil(r.startY / 320) * 320
        while y < r.endY {
            let side: Double = (Int(y / 320) % 2 == 0) ? -1 : 1
            let x = side < 0 ? r.leftBankX(atY: y) - 9 : r.rightBankX(atY: y) + 9
            add(Entity(kind: .lamp, reachIndex: r.index, x: x, y: y, node: PropNodes.lamp(side: CGFloat(side))))
            y += 320
        }
    }

    private func add(_ e: Entity) {
        entities.append(e)
        world.addChild(e.node)
    }

    private func pruneEntities(below y: Double) {
        entities.removeAll { e in
            guard e.y < y - 200 || !e.alive else { return false }
            e.node.removeFromParent()
            return true
        }
    }

    private func spawnWreckGhost() {
        // The previous run's wreck drifts past, sinking, in the first 1.5 s.
        let ghost = CraftNode()
        ghost.setVisibleAlive(true)
        ghost.alpha = 0.55
        ghost.zRotation = 0.6
        ghost.zPosition = 60
        let ghostY = 260.0
        let p = projection(scroll: scrollFor(distance: 0)).project(x: lastDeathX, y: ghostY)
        ghost.position = p.point
        ghost.setScale(p.scale)
        world.addChild(ghost)
        ghost.run(SKAction.sequence([
            SKAction.group([SKAction.fadeOut(withDuration: 1.5), SKAction.moveBy(x: 0, y: -size.height * 0.35, duration: 1.5),
                            SKAction.scale(to: p.scale * 0.6, duration: 1.5)]),
            SKAction.removeFromParent()]))
    }

    // MARK: Camera

    private func scrollFor(distance: Double) -> CGFloat {
        let p = Projection(screen: size, scroll: 0)
        return CGFloat(distance) - p.worldAhead(v: Projection.craftLane)
    }

    private func projection(scroll: CGFloat) -> Projection { Projection(screen: size, scroll: scroll) }

    private var visibleTop: Double {
        let p = Projection(screen: size, scroll: 0)
        return Double(scrollFor(distance: state.distance) + p.worldAhead(v: 1.0))
    }

    // MARK: Frame

    override func update(_ currentTime: TimeInterval) {
        if lastTime == 0 { lastTime = currentTime }
        let dt = min(max(currentTime - lastTime, 0), 1.0 / 20.0)
        lastTime = currentTime
        now = currentTime

        switch phase {
        case .paused:
            return
        case .attract:
            simulateAttract(dt: dt)
        case .playing:
            simulate(dt: dt)
        case .dying:
            phaseTimer -= dt
            if phaseTimer <= 0 { finishDeath() }
        case .runOver:
            break
        }
        render()
    }

    private func simulateAttract(dt: Double) {
        let t = rules.tightened(for: state)
        let travelled = motion.update(dt: dt, steer: 0, throttleTarget: Tuning.slowMultiplier, steerRate: t.steerRate, cruiseSpeed: t.cruiseSpeed)
        state.distance += travelled
        // keep the craft on the centreline while idling
        motion.x += (river.centerX(atY: state.distance) - motion.x) * min(1, dt * 3)
        state.craftX = motion.x
        state.speedBlend = motion.speedBlend
        updateEntities(dt: dt, hostile: false)
        maintainWindow()
    }

    private func simulate(dt: Double) {
        let out = input.update(time: now)
        let t = rules.tightened(for: state)

        // motion
        let travelled = motion.update(dt: dt, steer: out.steer, throttleTarget: out.throttleTarget,
                                      steerRate: t.steerRate, cruiseSpeed: t.cruiseSpeed)
        let prevDistance = state.distance
        state.distance += travelled
        motion.x = min(max(motion.x, -40), Tuning.referenceWidth + 40)
        state.craftX = motion.x
        state.speedBlend = motion.speedBlend

        // fuel
        let overLantern = lanternOverlapping()
        let fuel = rules.applyFuel(&state, dt: dt, overlappingLantern: overLantern, speedBlend: motion.speedBlend)
        if overLantern && fuel.filled > 0 { Haptics.shared.fuelSkim(now: now) }
        if state.isLowFuel { Haptics.shared.lowFuel(now: now) }
        if fuel.ranOut { die(.fuel); return }

        rules.tick(&state, dt: dt)
        if rules.extraLifeCheck(&state) > 0 { hud.showCenter("EXTRA LIFE"); hud.run(SKAction.sequence([SKAction.wait(forDuration: 1.2), SKAction.run { [weak self] in self?.hud.hideCenter() }])) }

        // fire
        if out.fireRequested && tracers.filter({ !$0.enemy }).count < 2 {
            spawnTracer(x: motion.x, y: state.distance + 20, enemy: false)
        }

        updateEntities(dt: dt, hostile: true)
        updateTracers(dt: dt, cruise: t.cruiseSpeed)
        if phase != .playing { return }

        if let cause = terrainCollision() { die(cause); return }
        if now >= flickerUntil, let cause = hazardCollision() { die(cause); return }
        checkGrazes(dt: dt)
        checkWeirs(prevDistance: prevDistance)
        howToPrompts()
        maintainWindow()
    }

    private func maintainWindow() {
        let top = visibleTop + Tuning.reachLength * 2
        ensureReaches(through: top)
        for r in river.reaches where r.startY < top && r.endY > state.distance - 600 {
            buildEntities(for: r)
        }
        pruneEntities(below: Double(scrollFor(distance: state.distance)))
        // lighting follows the reach the craft is in
        if let r = reach(atY: state.distance), r.lighting != currentLightingState {
            currentLightingState = r.lighting
            lightingFrom = lighting
            lightingTarget = Lighting.state(map(r.lighting))
            lightingBlend = 0
        }
    }

    // MARK: Entities update

    private func updateEntities(dt: Double, hostile: Bool) {
        let top = visibleTop
        for e in entities where e.alive {
            guard e.y < top + 100 else { continue }
            switch e.kind {
            case .hulk:
                guard e.driftSpeed > 0 else { continue }
                let channels = river.channelsAt(y: e.y)
                let half = Tuning.hulkSize.width / 2
                e.x += e.driftSpeed * e.driftDir * dt
                if let ch = channels.first(where: { $0.contains(e.x) }) ?? channels.min(by: { abs($0.lowerBound - e.x) < abs($1.lowerBound - e.x) }) {
                    if e.x - half < ch.lowerBound { e.x = ch.lowerBound + half; e.driftDir = 1 }
                    if e.x + half > ch.upperBound { e.x = ch.upperBound - half; e.driftDir = -1 }
                }
            case .dragonfly:
                if e.dashRemaining > 0 {
                    let step = min(e.dashRemaining, Tuning.dragonflyDashSpeed * dt)
                    e.x += step * e.dashDir
                    e.dashRemaining -= step
                    let channels = river.channelsAt(y: e.y)
                    if let ch = channels.first(where: { $0.contains(e.x) }) {
                        let half = Tuning.dragonflySize / 2
                        if e.x - half < ch.lowerBound { e.x = ch.lowerBound + half; e.dashRemaining = 0 }
                        if e.x + half > ch.upperBound { e.x = ch.upperBound - half; e.dashRemaining = 0 }
                    } else { e.dashRemaining = 0 }
                } else if e.dashCadence > 0 {
                    e.dashTimer -= dt
                    if e.dashTimer <= 0 {
                        e.dashTimer = e.dashCadence
                        e.dashRemaining = Tuning.dragonflyDashDistance
                        e.dashDir = motion.x < e.x ? -1 : 1
                    }
                }
                if hostile && e.fires && e.fireInterval > 0 && e.y > state.distance + 60 {
                    e.fireTimer -= dt
                    if e.fireTimer <= Tuning.dragonflyFireTelegraph && e.telegraph == 0 {
                        e.telegraph = 1
                        e.node.enumerateChildNodes(withName: "rotor") { n, _ in
                            n.run(SKAction.sequence([SKAction.scale(to: 1.5, duration: 0.1), SKAction.scale(to: 1.0, duration: 0.3)]))
                        }
                    }
                    if e.fireTimer <= 0 {
                        e.fireTimer = e.fireInterval
                        e.telegraph = 0
                        spawnTracer(x: e.x, y: e.y - 20, enemy: true)
                    }
                }
            case .teeth:
                e.angle += e.pivot * dt
                e.node.zRotation = CGFloat(e.angle)
            default:
                break
            }
        }
    }

    private func spawnTracer(x: Double, y: Double, enemy: Bool) {
        let node = enemy ? PropNodes.enemyTracer() : PropNodes.tracer()
        node.zPosition = 65
        world.addChild(node)
        tracers.append(Tracer(node: node, x: x, y: y, prevY: y, enemy: enemy))
    }

    private func updateTracers(dt: Double, cruise: Double) {
        let top = visibleTop
        var keep: [Tracer] = []
        for var tr in tracers {
            tr.prevY = tr.y
            if tr.enemy {
                tr.y -= Tuning.dragonflyTracerSpeed * dt
                if tr.y < state.distance - 300 { tr.node.removeFromParent(); continue }
                if phase == .playing && now >= flickerUntil && abs(tr.x - motion.x) < 13 && abs(tr.y - state.distance) < 22 {
                    tr.node.removeFromParent()
                    die(.dragonflyTracer)
                    return
                }
                keep.append(tr)
            } else {
                tr.y += (900 + motion.scrollSpeed(cruise: cruise)) * dt
                if tr.y > top {
                    tr.node.removeFromParent()
                    rules.tracerMissed(&state)
                    continue
                }
                if tracerHits(&tr) { tr.node.removeFromParent(); continue }
                keep.append(tr)
            }
        }
        tracers = keep
    }

    /// Returns true when the tracer hit something (and handles the kill).
    private func tracerHits(_ tr: inout Tracer) -> Bool {
        let y0 = tr.prevY, y1 = tr.y
        func crosses(_ y: Double, halfLen: Double) -> Bool { y + halfLen >= y0 && y - halfLen <= y1 }
        for e in entities where e.alive {
            switch e.kind {
            case .hulk:
                if abs(tr.x - e.x) <= Tuning.hulkSize.width / 2 && crosses(e.y, halfLen: Tuning.hulkSize.length / 2) {
                    kill(e, kind: .hulk, color: UIColor(red: 1, green: 0.7, blue: 0.4, alpha: 1), big: true); return true
                }
            case .dragonfly:
                if abs(tr.x - e.x) <= Tuning.dragonflySize / 2 && crosses(e.y, halfLen: Tuning.dragonflySize / 2) {
                    kill(e, kind: .dragonfly, color: UIColor(red: 0.6, green: 1, blue: 0.9, alpha: 1), big: false); return true
                }
            case .lantern:
                if abs(tr.x - e.x) <= Tuning.lanternWidth / 2 && crosses(e.y, halfLen: Tuning.lanternLength / 2) {
                    kill(e, kind: .lantern, color: UIColor(red: 1, green: 0.75, blue: 0.4, alpha: 1), big: false); return true
                }
            case .teeth:
                // anchor buoy: whole chain
                if abs(tr.x - e.x) <= 11 && crosses(e.y, halfLen: 11) {
                    let n = e.mineAlive.filter { $0 }.count
                    kill(e, kind: .teethChain(mines: n), color: UIColor(red: 1, green: 0.45, blue: 0.3, alpha: 1), big: true); return true
                }
                for (i, off) in e.mineOffsets.enumerated() where e.mineAlive[i] {
                    let mx = e.x + cos(e.angle) * off, my = e.y + sin(e.angle) * off
                    if abs(tr.x - mx) <= Tuning.mineDiameter / 2 + 2 && crosses(my, halfLen: Tuning.mineDiameter / 2 + 2) {
                        e.mineAlive[i] = false
                        let ex = PropNodes.explosion(color: UIColor(red: 1, green: 0.45, blue: 0.3, alpha: 1), big: false)
                        ex.position = e.mineNodes[i].convert(.zero, to: world)
                        ex.zPosition = 80
                        world.addChild(ex)
                        e.mineNodes[i].removeFromParent()
                        rules.awardKill(&state, kind: .mine)
                        Haptics.shared.kill()
                        if !e.mineAlive.contains(true) { e.alive = false; e.node.removeFromParent() }
                        return true
                    }
                }
            default:
                break
            }
        }
        return false
    }

    private func kill(_ e: Entity, kind: KillKind, color: UIColor, big: Bool) {
        e.alive = false
        let ex = PropNodes.explosion(color: color, big: big)
        ex.position = e.node.position
        ex.setScale(e.node.xScale)
        ex.zPosition = 80
        world.addChild(ex)
        e.node.removeFromParent()
        rules.awardKill(&state, kind: kind)
        Haptics.shared.kill()
    }

    // MARK: Collisions

    private let craftHalfW = 11.0
    private let craftHalfL = 18.0

    private func terrainCollision() -> DeathCause? {
        let x0 = motion.x - craftHalfW, x1 = motion.x + craftHalfW
        var y = state.distance - craftHalfL
        while y <= state.distance + craftHalfL {
            let channels = river.channelsAt(y: y)
            guard channels.contains(where: { $0.lowerBound <= x0 && $0.upperBound >= x1 }) else {
                let left = river.leftBankX(atY: y), right = river.rightBankX(atY: y)
                return (x0 < left || x1 > right) ? .bank : .island
            }
            y += 9
        }
        for e in entities where e.alive && e.kind == .piling {
            if circleHitsCraft(x: e.x, y: e.y, r: Tuning.pilingDiameter / 2) { return .piling }
        }
        for e in entities where e.alive && e.kind == .weir {
            guard let w = e.weir else { continue }
            if abs(state.distance - w.y) < 7 + craftHalfL {
                if x0 < w.spanLeftX || x1 > w.spanRightX { return .weirWall }
            }
        }
        return nil
    }

    private func hazardCollision() -> DeathCause? {
        for e in entities where e.alive {
            switch e.kind {
            case .hulk:
                if rectHitsCraft(x: e.x, y: e.y, halfW: Tuning.hulkSize.width / 2, halfL: Tuning.hulkSize.length / 2) { return .hulk }
            case .dragonfly:
                if rectHitsCraft(x: e.x, y: e.y, halfW: Tuning.dragonflySize / 2 - 4, halfL: Tuning.dragonflySize / 2 - 4) { return .dragonfly }
            case .teeth:
                for (i, off) in e.mineOffsets.enumerated() where e.mineAlive[i] {
                    let mx = e.x + cos(e.angle) * off, my = e.y + sin(e.angle) * off
                    if circleHitsCraft(x: mx, y: my, r: Tuning.mineDiameter / 2) { return .mine }
                }
            default:
                break
            }
        }
        return nil
    }

    private func rectHitsCraft(x: Double, y: Double, halfW: Double, halfL: Double) -> Bool {
        abs(x - motion.x) < halfW + craftHalfW && abs(y - state.distance) < halfL + craftHalfL
    }

    private func circleHitsCraft(x: Double, y: Double, r: Double) -> Bool {
        // capsule vs circle: clamp to the craft's axis segment
        let cy = min(max(y, state.distance - craftHalfL + craftHalfW), state.distance + craftHalfL - craftHalfW)
        let dx = x - motion.x, dy = y - cy
        return dx * dx + dy * dy < (r + craftHalfW) * (r + craftHalfW)
    }

    private func lanternOverlapping() -> Bool {
        for e in entities where e.alive && e.kind == .lantern {
            if abs(e.x - motion.x) < Tuning.lanternWidth / 2 + craftHalfW && abs(e.y - state.distance) < Tuning.lanternLength / 2 {
                return true
            }
        }
        return false
    }

    // MARK: Graze

    private func checkGrazes(dt: Double) {
        var near: [String: Double] = [:]   // edge id → distance
        let y = state.distance
        let x0 = motion.x - craftHalfW, x1 = motion.x + craftHalfW
        let dl = x0 - river.leftBankX(atY: y)
        let dr = river.rightBankX(atY: y) - x1
        if dl >= 0 && dl <= Tuning.grazeDistance { near["bankL"] = dl }
        if dr >= 0 && dr <= Tuning.grazeDistance { near["bankR"] = dr }
        if let r = river.reach(atY: y) {
            for island in r.allIslands where island.covers(y: y) {
                let span = river.islandSpan(island, atY: y)
                let a = span.lowerBound - x1, b = x0 - span.upperBound
                if a >= 0 && a <= Tuning.grazeDistance { near["island\(Int(island.yStart))L"] = a }
                if b >= 0 && b <= Tuning.grazeDistance { near["island\(Int(island.yStart))R"] = b }
            }
        }
        for e in entities where e.alive && e.kind == .piling {
            let cy = min(max(e.y, y - craftHalfL), y + craftHalfL)
            let d = ((e.x - motion.x) * (e.x - motion.x) + (e.y - cy) * (e.y - cy)).squareRoot() - Tuning.pilingDiameter / 2 - craftHalfW
            if d >= 0 && d <= Tuning.grazeDistance { near["piling\(Int(e.y))-\(Int(e.x))"] = d }
        }
        for key in Array(grazeTimers.keys) where near[key] == nil { grazeTimers[key] = nil }
        for (key, _) in near {
            grazeTimers[key, default: 0] += dt
            if grazeTimers[key]! >= Tuning.grazeTime, now - (grazeCooldowns[key] ?? -10) >= Tuning.grazeCooldown {
                grazeCooldowns[key] = now
                grazeTimers[key] = 0
                rules.awardGraze(&state)
                Haptics.shared.graze()
                let spark = PropNodes.explosion(color: UIColor(red: 0.7, green: 0.95, blue: 1, alpha: 1), big: false)
                spark.setScale(0.35)
                spark.position = craft.position
                spark.zPosition = 69
                world.addChild(spark)
            }
        }
    }

    // MARK: Weirs

    private func checkWeirs(prevDistance: Double) {
        for e in entities where e.alive && e.kind == .weir && !e.passed {
            guard let w = e.weir else { continue }
            if prevDistance < w.y && state.distance >= w.y {
                e.passed = true
                rules.awardWeir(&state, atY: w.y)
                Haptics.shared.weirCleared()
                hud.showCenter("GATE \(state.weirsCleared)")
                hud.run(SKAction.sequence([SKAction.wait(forDuration: 0.8), SKAction.run { [weak self] in self?.hud.hideCenter() }]))
                if !SaveStore.shared.data.howToSeen { SaveStore.shared.update { $0.howToSeen = true }; howToStep = 99 }
            }
        }
    }

    // MARK: How-to

    private func howToPrompts() {
        guard howToStep < 99 else { return }
        let d = state.distance
        switch howToStep {
        case 0 where d > 80:
            hud.showCenter("SLIDE TO STEER", sub: "your thumb can rest anywhere"); howToStep = 1
        case 1 where d > 420:
            hud.showCenter("EASE OFF OVER THE LANTERNS", sub: "slide down to slow, up to go fast"); howToStep = 2
        case 2 where d > 900:
            hud.showCenter("HOLD STILL TO FIRE", sub: "steering silences the gun"); howToStep = 3
        case 3 where d > 1400:
            hud.hideCenter(); howToStep = 4
        default:
            break
        }
    }

    // MARK: Death

    private func die(_ cause: DeathCause) {
        guard phase == .playing else { return }
        phase = .dying
        phaseTimer = Tuning.respawnDelay
        lastDeathX = motion.x
        Haptics.shared.death()
        hud.flash()
        let ex = PropNodes.explosion(color: UIColor(red: 1, green: 0.85, blue: 0.6, alpha: 1), big: true)
        ex.position = craft.position
        ex.zPosition = 90
        world.addChild(ex)
        craft.setVisibleAlive(false)
        for t in tracers { t.node.removeFromParent() }
        tracers.removeAll()
        pendingCause = cause
    }

    private var pendingCause: DeathCause = .bank

    private func finishDeath() {
        let outcome = rules.die(&state, cause: pendingCause)
        switch outcome {
        case .respawn:
            // Respawn at the last weir with the section fresh.
            motion = CraftMotion(x: river.centerX(atY: state.respawnY))
            state.craftX = motion.x
            for e in entities { e.node.removeFromParent() }
            entities.removeAll(); builtReaches.removeAll()
            grazeTimers.removeAll()
            craft.setVisibleAlive(true)
            flickerUntil = now + Tuning.respawnFlicker
            craft.flicker(until: flickerUntil)
            input = InputModel()
            phase = .playing
            maintainWindow()
        case .runOver:
            phase = .runOver
            let best = max(SaveStore.shared.data.bestScore, state.score)
            SaveStore.shared.update { $0.bestScore = best; $0.bestChain = max($0.bestChain, state.chainPeak) }
            let mult = RulesEngine.chainMultiplier(chain: state.chainPeak)
            let lines = "BEST \(HUDNode.format(best))   ·   CHAIN PEAK ×\(String(format: "%.2g", mult))   ·   GATES \(state.weirsCleared)\nextra life at 10,000 then every 25,000"
            hud.showCard(title: cause(pendingCause), score: state.score, lines: lines, primary: "RESTART",
                         secondary: [("NEW RIVER", "newriver"), (dailyMode ? "DAILY: ON" : "DAILY: OFF", "daily"), ("SETTINGS", "settings")])
        }
    }

    private func cause(_ c: DeathCause) -> String {
        switch c {
        case .bank: return "THE BANK"
        case .island: return "THE ISLAND"
        case .piling: return "PILINGS"
        case .hulk: return "A HULK"
        case .dragonfly: return "A DRAGONFLY"
        case .mine: return "THE TEETH"
        case .weirWall: return "THE WEIR"
        case .dragonflyTracer: return "DRAGONFLY FIRE"
        case .fuel: return "OUT OF FUEL"
        }
    }

    // MARK: Pause / buttons

    func pauseFromSystem() {
        guard phase == .playing || phase == .attract else { return }
        pause()
    }

    private func pause() {
        pausedFrom = phase
        phase = .paused
        world.isPaused = true
        hud.showCard(title: "PAUSED", score: state.score, lines: dailyMode ? "DAILY RIVER · \(modifierName(modifier))" : "", primary: "RESUME",
                     secondary: [("RESTART", "restart"), (Haptics.shared.enabled ? "HAPTICS ON" : "HAPTICS OFF", "haptics")])
    }

    private func resume() {
        hud.hideCard()
        // 3-2-1 countdown before play resumes
        var steps: [SKAction] = []
        for n in [3, 2, 1] {
            steps.append(SKAction.run { [weak self] in self?.hud.showCenter("\(n)") })
            steps.append(SKAction.wait(forDuration: 0.5))
        }
        steps.append(SKAction.run { [weak self] in
            guard let self else { return }
            self.hud.hideCenter()
            self.world.isPaused = false
            self.lastTime = 0
            self.input = InputModel()
            self.phase = self.pausedFrom
        })
        hud.run(SKAction.sequence(steps))
    }

    private func buttonTapped(_ name: String) {
        switch (phase, name) {
        case (.paused, "primary"): resume()
        case (.paused, "restart"): world.isPaused = false; hud.hideCard(); beginRun(newSeed: false); enterAttract()
        case (.paused, "haptics"), (.runOver, "haptics"):
            Haptics.shared.enabled.toggle()
            SaveStore.shared.update { $0.hapticsOn = Haptics.shared.enabled }
            if phase == .paused { hud.hideCard(); pause() } else { finishDeath() }
        case (.runOver, "primary"): beginRun(newSeed: false); enterAttract()
        case (.runOver, "newriver"): beginRun(newSeed: true); enterAttract()
        case (.runOver, "daily"): dailyMode.toggle(); beginRun(newSeed: true); enterAttract()
        case (.runOver, "settings"):
            hud.showCard(title: "SETTINGS", score: state.score, lines: "", primary: "BACK",
                         secondary: [(Haptics.shared.enabled ? "HAPTICS ON" : "HAPTICS OFF", "haptics"), ("REPLAY HOW-TO", "howto")])
        case (.runOver, "howto"):
            SaveStore.shared.update { $0.howToSeen = false }
            finishDeathCardAgain()
        default:
            break
        }
    }

    private func finishDeathCardAgain() {
        let best = SaveStore.shared.data.bestScore
        hud.showCard(title: cause(pendingCause), score: state.score, lines: "BEST \(HUDNode.format(best))", primary: "RESTART",
                     secondary: [("NEW RIVER", "newriver"), (dailyMode ? "DAILY: ON" : "DAILY: OFF", "daily"), ("SETTINGS", "settings")])
    }

    // MARK: Touches

    private func point(_ t: UITouch) -> Point {
        let l = t.location(in: self)
        return Point(x: Double(l.x), y: Double(size.height - l.y))   // y-down for the input model
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            let loc = t.location(in: self)
            if let name = hud.hit(loc) {
                if name == "pause" {
                    if phase == .playing || phase == .attract { pause() }
                } else if phase == .paused || phase == .runOver {
                    buttonTapped(name)
                }
                continue
            }
            if phase == .runOver || phase == .paused { continue }
            if phase == .attract { startPlaying() }
            if primaryTouch == nil {
                primaryTouch = t
                input.touchBegan(at: point(t), time: now)
            } else if secondTouch == nil {
                secondTouch = t
                input.secondFingerDown = true
            }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches where t == primaryTouch {
            input.touchMoved(to: point(t), time: now)
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { endTouches(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { endTouches(touches) }

    private func endTouches(_ touches: Set<UITouch>) {
        for t in touches {
            if t == primaryTouch {
                input.touchEnded(at: point(t), time: now)
                primaryTouch = nil
            } else if t == secondTouch {
                secondTouch = nil
                input.secondFingerDown = false
            }
        }
    }

    // MARK: Render

    private func render() {
        let scroll = scrollFor(distance: state.distance)
        let proj = projection(scroll: scroll)

        // lighting transition
        if lightingBlend < 1 {
            lightingBlend = min(1, lightingBlend + 0.5 / 60)
            lighting = Lighting.mix(lightingFrom, lightingTarget, lightingBlend)
            water.setLighting(lighting)
            hud.setColor(lighting.hudColor)
        }

        // nearest lantern ahead for the reflection streak
        var nearest: SIMD2<Float>? = nil
        var bestD = Double.infinity
        for e in entities where e.alive && e.kind == .lantern {
            let d = abs(e.y - state.distance)
            if d < bestD { bestD = d; nearest = SIMD2<Float>(Float(e.x), Float(e.y)) }
        }
        let speed01 = Float((motion.speedBlend - Tuning.slowMultiplier) / (Tuning.fastMultiplier - Tuning.slowMultiplier))
        water.update(scroll: Float(scroll), craft: SIMD2<Float>(Float(motion.x), Float(state.distance)),
                     speedBlend: speed01, lantern: nearest)

        // entities
        for e in entities where e.alive {
            let p = proj.project(x: e.x, y: e.y)
            e.node.position = p.point
            e.node.setScale(p.scale)
            e.node.zPosition = 10 + (1 - p.v) * 50
            e.node.isHidden = p.v > 1.15 || p.v < -0.2
        }
        for tr in tracers {
            let p = proj.project(x: tr.x, y: tr.y)
            tr.node.position = p.point
            tr.node.setScale(p.scale)
        }

        // craft
        let cp = proj.project(x: motion.x, y: state.distance)
        craft.position = cp.point
        craft.setScale(cp.scale)
        let t = rules.tightened(for: state)
        craft.update(lean: CGFloat(motion.leanDegrees(steerRate: t.steerRate) / Tuning.maxLeanDegrees),
                     speedBlend: CGFloat(speed01), now: now)

        hud.update(score: state.score, chainMultiplier: rules.chainMultiplier(state), fuel: state.fuel,
                   lives: state.totalLives, lowFuel: state.isLowFuel)
    }
}
