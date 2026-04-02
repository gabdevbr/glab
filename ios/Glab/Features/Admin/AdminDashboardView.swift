import SwiftUI

struct AdminStatsResponse: Decodable {
    let totalUsers: Int
    let totalChannels: Int
    let totalMessages: Int
    let onlineUsers: Int
    let storageBytes: Int64?

    enum CodingKeys: String, CodingKey {
        case totalUsers = "total_users"
        case totalChannels = "total_channels"
        case totalMessages = "total_messages"
        case onlineUsers = "online_users"
        case storageBytes = "storage_bytes"
    }
}

struct AdminDashboardView: View {
    @Environment(AppState.self) private var appState
    @State private var stats: AdminStatsResponse?
    @State private var users: [UserResponse] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var showSettings = false

    var body: some View {
        List {
            if let stats {
                Section("Overview") {
                    StatRow(label: "Users", value: "\(stats.totalUsers)", icon: "person.2.fill")
                    StatRow(label: "Channels", value: "\(stats.totalChannels)", icon: "number")
                    StatRow(label: "Messages", value: formatNumber(stats.totalMessages), icon: "bubble.left.fill")
                    StatRow(label: "Online Now", value: "\(stats.onlineUsers)", icon: "circle.fill", color: .green)
                    if let bytes = stats.storageBytes {
                        StatRow(label: "Storage", value: ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file), icon: "externaldrive.fill")
                    }
                }
            }

            Section {
                NavigationLink("Settings") {
                    AdminSettingsView()
                        .environment(appState)
                }
            }

            Section("Users") {
                ForEach(filteredUsers) { user in
                    HStack(spacing: 10) {
                        AvatarView(user.displayName, url: user.avatarURL, size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.displayName)
                                .font(.subheadline.weight(.medium))
                            Text("@\(user.username) \u{2022} \(user.role)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if user.isBot {
                            Text("BOT")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.purple)
                        }
                    }
                }
            }
        }
        .searchable(text: $searchText, prompt: "Filter users")
        .navigationTitle("Admin")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadData() }
        .task { await loadData() }
    }

    private var filteredUsers: [UserResponse] {
        if searchText.isEmpty { return users }
        return users.filter {
            $0.displayName.localizedCaseInsensitiveContains(searchText) ||
            $0.username.localizedCaseInsensitiveContains(searchText)
        }
    }

    private func loadData() async {
        isLoading = true
        defer { isLoading = false }
        stats = try? await appState.apiClient.request(.adminStats)
        users = (try? await appState.apiClient.request(.adminListUsers(limit: 200)) as [UserResponse]) ?? []
    }

    private func formatNumber(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fK", Double(n) / 1_000) }
        return "\(n)"
    }
}

private struct StatRow: View {
    let label: String
    let value: String
    let icon: String
    var color: Color = .accentColor

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 24)
            Text(label)
            Spacer()
            Text(value)
                .font(.body.monospacedDigit().weight(.medium))
                .foregroundStyle(.secondary)
        }
    }
}
