import UIKit
import SpriteKit

/// Hosts the single SpriteKit scene. Full screen, portrait, no status bar,
/// home indicator auto-hidden, bottom-edge system gesture deferred so a thumb
/// resting at the bottom of the screen does not pull up the app switcher.
final class GameViewController: UIViewController {
    private var skView: SKView { view as! SKView }
    private var scene: GameScene?

    override func loadView() {
        view = SKView(frame: UIScreen.main.bounds)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        skView.ignoresSiblingOrder = true
        skView.preferredFramesPerSecond = 60
        skView.isMultipleTouchEnabled = true
        #if DEBUG
        skView.showsFPS = true
        skView.showsNodeCount = true
        skView.showsDrawCount = true
        #endif
        NotificationCenter.default.addObserver(self, selector: #selector(appWillResignActive),
                                               name: UIApplication.willResignActiveNotification, object: nil)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if scene == nil, view.bounds.width > 0 {
            let scene = GameScene(size: view.bounds.size)
            scene.scaleMode = .resizeFill
            scene.safeAreaInsets = view.safeAreaInsets
            skView.presentScene(scene)
            self.scene = scene
        } else {
            scene?.safeAreaInsets = view.safeAreaInsets
        }
    }

    @objc private func appWillResignActive() {
        scene?.pauseFromSystem()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom] }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}
