import SwiftUI

/// Small colored dot indicating user presence status.
struct PresenceDot: View {
    let status: String
    var size: CGFloat = 10

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay {
                Circle().stroke(.background, lineWidth: 1.5)
            }
            .accessibilityLabel(status.capitalized)
    }

    private var color: Color {
        switch status {
        case "online": return .green
        case "away": return .yellow
        case "dnd": return .red
        default: return .gray
        }
    }
}
