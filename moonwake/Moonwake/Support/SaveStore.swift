import Foundation

/// Local save: best score, settings, first-run flag. One JSON file in
/// Application Support. No cloud, no server.
struct SaveData: Codable {
    var bestScore: Int = 0
    var bestChain: Int = 0
    var runsPlayed: Int = 0
    var howToSeen: Bool = false
    var hapticsOn: Bool = true
    var soundVolume: Float = 1.0
    var engineVolume: Float = 0.8
    var leftHanded: Bool = false
    var reduceMotion: Bool = false
    var lastSeed: UInt64 = 0
}

final class SaveStore {
    static let shared = SaveStore()
    private(set) var data: SaveData
    private let url: URL

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Moonwake", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent("save.json")
        if let d = try? Data(contentsOf: url), let decoded = try? JSONDecoder().decode(SaveData.self, from: d) {
            data = decoded
        } else {
            data = SaveData()
        }
    }

    func update(_ change: (inout SaveData) -> Void) {
        change(&data)
        if let encoded = try? JSONEncoder().encode(data) {
            try? encoded.write(to: url, options: .atomic)
        }
    }
}
