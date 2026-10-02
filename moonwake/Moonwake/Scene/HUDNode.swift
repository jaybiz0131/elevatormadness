import SpriteKit

/// Heads-up display and the v1 screens (attract line, pause, death card,
/// how-to prompts). All code-drawn, all in the top 12% or the bottom third
/// so the thumb zone stays readable. Buttons report taps via `onTap`.
final class HUDNode: SKNode {
    private let fuelBack = SKShapeNode(rectOf: CGSize(width: 150, height: 5), cornerRadius: 2.5)
    private let fuelFill = SKSpriteNode(color: UIColor(red: 1, green: 0.82, blue: 0.48, alpha: 1), size: CGSize(width: 150, height: 5))
    private let fuelLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let scoreLabel = SKLabelNode(fontNamed: "AvenirNext-Bold")
    private let chainLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let livesNode = SKNode()
    private let pauseChip = SKShapeNode(rectOf: CGSize(width: 32, height: 20), cornerRadius: 10)
    private let centerLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let subLabel = SKLabelNode(fontNamed: "AvenirNext-Regular")
    private let card = SKNode()
    private let cardTitle = SKLabelNode(fontNamed: "AvenirNext-Bold")
    private let cardScore = SKLabelNode(fontNamed: "AvenirNext-Bold")
    private let cardLines = SKLabelNode(fontNamed: "AvenirNext-Regular")
    private let restartButton = SKNode()
    private let secondaryButtons = SKNode()
    private let dim = SKSpriteNode(color: UIColor(white: 0, alpha: 0.55), size: .zero)
    private let flashNode = SKSpriteNode(color: .white, size: .zero)

    private(set) var size: CGSize = .zero
    private var insets = UIEdgeInsets.zero
    var onTap: ((String) -> Void)?

    override init() {
        super.init()
        zPosition = 100
        fuelBack.fillColor = UIColor(white: 1, alpha: 0.14); fuelBack.strokeColor = .clear
        fuelFill.anchorPoint = CGPoint(x: 0, y: 0.5)
        fuelLabel.text = "FUEL"; fuelLabel.fontSize = 12; fuelLabel.horizontalAlignmentMode = .left; fuelLabel.alpha = 0.75
        scoreLabel.fontSize = 26; scoreLabel.horizontalAlignmentMode = .right
        chainLabel.fontSize = 12; chainLabel.horizontalAlignmentMode = .right; chainLabel.alpha = 0.75
        pauseChip.fillColor = UIColor(white: 1, alpha: 0.12); pauseChip.strokeColor = .clear
        pauseChip.name = "pause"
        for dx in [-3.5, 3.5] as [CGFloat] {
            let bar = SKShapeNode(rectOf: CGSize(width: 3, height: 10))
            bar.fillColor = .white; bar.strokeColor = .clear; bar.position = CGPoint(x: dx, y: 0)
            bar.name = "pause"
            pauseChip.addChild(bar)
        }
        centerLabel.fontSize = 15; centerLabel.alpha = 0
        subLabel.fontSize = 12; subLabel.alpha = 0
        dim.anchorPoint = .zero; dim.isHidden = true; dim.zPosition = -1
        flashNode.anchorPoint = .zero; flashNode.alpha = 0; flashNode.zPosition = -2; flashNode.blendMode = .add
        [fuelBack, fuelFill, fuelLabel, scoreLabel, chainLabel, livesNode, pauseChip, centerLabel, subLabel, dim, flashNode].forEach { addChild($0) }

        cardTitle.fontSize = 14; cardTitle.alpha = 0.75
        cardScore.fontSize = 44
        cardLines.fontSize = 12; cardLines.alpha = 0.75; cardLines.numberOfLines = 3; cardLines.lineBreakMode = .byWordWrapping
        card.addChild(cardTitle); card.addChild(cardScore); card.addChild(cardLines)
        card.addChild(restartButton); card.addChild(secondaryButtons)
        card.isHidden = true
        addChild(card)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func layout(size: CGSize, insets: UIEdgeInsets) {
        self.size = size
        self.insets = insets
        let top = size.height - max(insets.top, 20) - 14
        fuelLabel.position = CGPoint(x: 20, y: top - 10)
        fuelBack.position = CGPoint(x: 20 + 75, y: top - 26)
        fuelFill.position = CGPoint(x: 20, y: top - 26)
        livesNode.position = CGPoint(x: 20, y: top - 46)
        scoreLabel.position = CGPoint(x: size.width - 20, y: top - 30)
        chainLabel.position = CGPoint(x: size.width - 20, y: top - 48)
        pauseChip.position = CGPoint(x: size.width / 2, y: top - 22)
        centerLabel.position = CGPoint(x: size.width / 2, y: size.height * 0.52)
        subLabel.position = CGPoint(x: size.width / 2, y: size.height * 0.52 - 22)
        dim.size = size
        flashNode.size = size
        card.position = CGPoint(x: size.width / 2, y: size.height * 0.5)
        cardTitle.position = CGPoint(x: 0, y: 70)
        cardScore.position = CGPoint(x: 0, y: 24)
        cardLines.position = CGPoint(x: 0, y: -24)
        restartButton.position = CGPoint(x: 0, y: -size.height * 0.22)
        secondaryButtons.position = CGPoint(x: 0, y: -size.height * 0.22 - 64)
    }

    func setColor(_ c: UIColor) {
        [fuelLabel, scoreLabel, chainLabel, centerLabel, subLabel, cardTitle, cardScore, cardLines].forEach { $0.fontColor = c }
    }

    func update(score: Int, chainMultiplier: Double, fuel: Double, lives: Int, lowFuel: Bool) {
        scoreLabel.text = Self.format(score)
        chainLabel.text = chainMultiplier > 1.001 ? String(format: "CHAIN ×%.2g", chainMultiplier) : ""
        fuelFill.xScale = CGFloat(max(0, min(1, fuel / 100)))
        fuelFill.color = lowFuel ? UIColor(red: 1, green: 0.4, blue: 0.3, alpha: 1) : UIColor(red: 1, green: 0.82, blue: 0.48, alpha: 1)
        if livesNode.children.count != lives {
            livesNode.removeAllChildren()
            for i in 0..<max(0, lives) {
                let p = CGMutablePath()
                p.move(to: CGPoint(x: 0, y: 5)); p.addLine(to: CGPoint(x: 4, y: -5)); p.addLine(to: CGPoint(x: -4, y: -5)); p.closeSubpath()
                let s = SKShapeNode(path: p)
                s.fillColor = scoreLabel.fontColor ?? .white; s.strokeColor = .clear
                s.position = CGPoint(x: CGFloat(i) * 14, y: 0)
                livesNode.addChild(s)
            }
        }
    }

    func showCenter(_ text: String, sub: String? = nil) {
        centerLabel.text = text; centerLabel.alpha = 1
        subLabel.text = sub ?? ""; subLabel.alpha = sub == nil ? 0 : 1
    }
    func hideCenter() {
        centerLabel.run(SKAction.fadeOut(withDuration: 0.25))
        subLabel.run(SKAction.fadeOut(withDuration: 0.25))
    }

    /// Full-screen white flash with hit-stop feel, used on death.
    func flash() {
        flashNode.alpha = 0.6
        flashNode.run(SKAction.fadeOut(withDuration: 0.3))
    }

    func showCard(title: String, score: Int, lines: String, primary: String, secondary: [(String, String)]) {
        dim.isHidden = false
        card.isHidden = false
        cardTitle.text = title
        cardScore.text = Self.format(score)
        cardLines.text = lines
        cardLines.preferredMaxLayoutWidth = size.width - 60
        restartButton.removeAllChildren()
        restartButton.addChild(button(label: primary, name: "primary", width: size.width - 80, height: 56, filled: true))
        secondaryButtons.removeAllChildren()
        let w = (size.width - 80 - CGFloat(secondary.count - 1) * 12) / CGFloat(max(1, secondary.count))
        for (i, (label, name)) in secondary.enumerated() {
            let b = button(label: label, name: name, width: w, height: 40, filled: false)
            b.position = CGPoint(x: -(size.width - 80) / 2 + w / 2 + CGFloat(i) * (w + 12), y: 0)
            secondaryButtons.addChild(b)
        }
    }
    func hideCard() { dim.isHidden = true; card.isHidden = true }

    private func button(label: String, name: String, width: CGFloat, height: CGFloat, filled: Bool) -> SKNode {
        let n = SKNode()
        let bg = SKShapeNode(rectOf: CGSize(width: width, height: height), cornerRadius: height / 2)
        bg.fillColor = filled ? UIColor(white: 1, alpha: 0.92) : UIColor(white: 1, alpha: 0.12)
        bg.strokeColor = .clear
        bg.name = name
        n.addChild(bg)
        let l = SKLabelNode(fontNamed: "AvenirNext-Bold")
        l.text = label; l.fontSize = filled ? 18 : 13
        l.fontColor = filled ? UIColor(red: 0.03, green: 0.05, blue: 0.1, alpha: 1) : .white
        l.verticalAlignmentMode = .center
        l.name = name
        n.addChild(l)
        return n
    }

    /// Returns the button name under a scene point, if any.
    func hit(_ p: CGPoint) -> String? {
        for node in nodes(at: convert(p, from: parent ?? self)) {
            if let name = node.name, !node.isHidden, (node.parent?.isHidden == false) { return name }
        }
        return nil
    }

    static func format(_ n: Int) -> String {
        let f = NumberFormatter(); f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}
