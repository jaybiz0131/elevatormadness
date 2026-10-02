// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MoonwakeCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "MoonwakeCore", targets: ["MoonwakeCore"]),
    ],
    targets: [
        .target(
            name: "MoonwakeCore",
            path: "Sources/MoonwakeCore"
        ),
        .testTarget(
            name: "MoonwakeCoreTests",
            dependencies: ["MoonwakeCore"],
            path: "Tests/MoonwakeCoreTests"
        ),
    ]
)
