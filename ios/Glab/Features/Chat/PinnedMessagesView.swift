import SwiftUI

struct PinnedMessagesView: View {
    let channelID: String
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var messages: [MessageResponse] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading pinned messages...")
                } else if messages.isEmpty {
                    ContentUnavailableView("No Pinned Messages", systemImage: "pin.slash", description: Text("Pin important messages to find them here."))
                } else {
                    List(messages) { msg in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                AvatarView(msg.displayName, url: msg.avatarURL, size: 24)
                                Text(msg.displayName)
                                    .font(.subheadline.weight(.semibold))
                                Spacer()
                                if let date = Date.fromISO(msg.createdAt) {
                                    Text(date.chatTimestamp)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Text(msg.content)
                                .font(.body)
                                .lineLimit(5)
                        }
                        .padding(.vertical, 4)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Pinned Messages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task {
                isLoading = true
                messages = (try? await appState.apiClient.request(.pinnedMessages(channelID: channelID)) as [MessageResponse]) ?? []
                isLoading = false
            }
        }
    }
}
