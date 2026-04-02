import SwiftUI
import Nuke
import NukeUI

/// Displays a user avatar with async loading and initials fallback.
struct AvatarView: View {
    let url: String?
    let displayName: String
    let size: CGFloat

    init(_ displayName: String, url: String? = nil, size: CGFloat = 36) {
        self.displayName = displayName
        self.url = url
        self.size = size
    }

    var body: some View {
        if let url, !url.isEmpty, let imageURL = resolvedURL(url) {
            LazyImage(url: imageURL) { state in
                if let image = state.image {
                    image.resizable().scaledToFill()
                } else {
                    initialsView
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            initialsView
        }
    }

    private var initialsView: some View {
        Circle()
            .fill(avatarColor)
            .frame(width: size, height: size)
            .overlay {
                Text(initials)
                    .font(.system(size: size * 0.4, weight: .semibold))
                    .foregroundStyle(.white)
            }
    }

    private var initials: String {
        let parts = displayName.split(separator: " ")
        let first = parts.first?.prefix(1) ?? ""
        let second = parts.count > 1 ? parts[1].prefix(1) : ""
        return "\(first)\(second)".uppercased()
    }

    private var avatarColor: Color {
        let hash = displayName.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        let colors: [Color] = [.blue, .green, .orange, .purple, .pink, .teal, .indigo, .cyan]
        return colors[hash % colors.count]
    }

    private func resolvedURL(_ path: String) -> URL? {
        if path.hasPrefix("http") {
            return URL(string: path)
        }
        // Relative path from backend — prepend server URL
        guard let server = ServerEnvironment.serverURL else { return nil }
        return server.appendingPathComponent(path)
    }
}
