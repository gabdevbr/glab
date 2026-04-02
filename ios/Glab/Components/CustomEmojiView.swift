import SwiftUI
import NukeUI

/// Renders text with custom emoji support.
/// Custom emojis are in the format `:emoji_name:` and are served at `/api/v1/emojis/custom/{name}`.
struct CustomEmojiText: View {
    let text: String

    // Regex to find :emoji_name: patterns
    private static let emojiPattern = /:([\w+-]+):/

    var body: some View {
        if text.contains(":"), let serverURL = ServerEnvironment.serverURL {
            renderWithEmojis(serverURL: serverURL)
        } else {
            Text(text)
        }
    }

    @ViewBuilder
    private func renderWithEmojis(serverURL: URL) -> some View {
        let parts = splitIntoParts(text)
        HStack(spacing: 0) {
            ForEach(parts.indices, id: \.self) { i in
                switch parts[i] {
                case .text(let str):
                    Text(str)
                case .emoji(let name):
                    let url = serverURL.appendingPathComponent("/api/v1/emojis/custom/\(name)")
                    LazyImage(url: url) { state in
                        if let image = state.image {
                            image.resizable().scaledToFit()
                        } else {
                            Text(":\(name):")
                        }
                    }
                    .frame(width: 20, height: 20)
                }
            }
        }
    }

    private enum Part {
        case text(String)
        case emoji(String)
    }

    private func splitIntoParts(_ input: String) -> [Part] {
        var parts: [Part] = []
        var remaining = input[...]

        while let match = remaining.firstMatch(of: Self.emojiPattern) {
            let before = remaining[remaining.startIndex..<match.range.lowerBound]
            if !before.isEmpty {
                parts.append(.text(String(before)))
            }
            parts.append(.emoji(String(match.1)))
            remaining = remaining[match.range.upperBound...]
        }

        if !remaining.isEmpty {
            parts.append(.text(String(remaining)))
        }

        return parts
    }
}
