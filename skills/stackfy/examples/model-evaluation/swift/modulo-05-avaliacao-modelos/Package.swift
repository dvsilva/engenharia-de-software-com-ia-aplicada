// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "modulo-05-avaliacao-modelos",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(name: "model-evaluation-harness-tool")
  ]
)
