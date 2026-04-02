import SwiftUI

/// Sheet showing another user's profile.
struct UserProfileView: View {
    let user: UserResponse

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                AvatarView(user.displayName, url: user.avatarURL, size: 80)

                Text(user.displayName)
                    .font(.title2.weight(.semibold))

                Text("@\(user.username)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(spacing: 4) {
                    PresenceDot(status: appState.presenceService.status(for: user.id))
                    Text(appState.presenceService.status(for: user.id).capitalized)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if user.isBot {
                    Label("Bot", systemImage: "cpu")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(.purple.opacity(0.2)))
                        .foregroundStyle(.purple)
                }

                Spacer()
            }
            .padding(.top, 32)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
