import SwiftUI

struct BrowseChannelsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var channels: [ChannelResponse] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var joiningID: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading channels...")
                } else {
                    List(filteredChannels) { channel in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 4) {
                                    Image(systemName: channel.isPrivate ? "lock.fill" : "number")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text(channel.name)
                                        .font(.body.weight(.medium))
                                }
                                if let desc = channel.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                                if let count = channel.memberCount {
                                    Text("\(count) members")
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            Spacer()
                            Button {
                                Task { await joinChannel(channel.id) }
                            } label: {
                                if joiningID == channel.id {
                                    ProgressView().controlSize(.small)
                                } else {
                                    Text("Join")
                                        .font(.subheadline.weight(.medium))
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .buttonBorderShape(.capsule)
                            .controlSize(.small)
                            .disabled(joiningID != nil)
                        }
                    }
                    .listStyle(.plain)
                    .searchable(text: $searchText, prompt: "Filter channels")
                }
            }
            .navigationTitle("Browse Channels")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await loadChannels() }
        }
    }

    private var filteredChannels: [ChannelResponse] {
        if searchText.isEmpty { return channels }
        return channels.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    private func loadChannels() async {
        isLoading = true
        defer { isLoading = false }
        channels = (try? await appState.apiClient.request(.browseChannels) as [ChannelResponse]) ?? []
    }

    private func joinChannel(_ id: String) async {
        joiningID = id
        defer { joiningID = nil }
        try? await appState.apiClient.requestVoid(.joinChannel(id: id))
        await appState.onChannelsNeedRefresh?()
        dismiss()
    }
}
