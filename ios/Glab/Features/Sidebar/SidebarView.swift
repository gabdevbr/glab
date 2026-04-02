import SwiftUI
import SwiftData

struct SidebarView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \CachedChannel.name) private var allChannels: [CachedChannel]
    @Binding var selectedChannelID: String?

    @State private var viewModel: SidebarViewModel?
    @State private var syncEngine: SyncEngine?
    @State private var showBrowseChannels = false
    @State private var showCreateChannel = false
    @State private var showSections = false

    var body: some View {
        List(selection: $selectedChannelID) {
            let pinned = allChannels.filter(\.isPinned)
            if !pinned.isEmpty {
                Section("Pinned") {
                    ForEach(pinned, id: \.id) { channel in
                        channelRow(channel)
                    }
                }
            }

            let channels = allChannels.filter { !$0.isDM && !$0.isPinned }
            if !channels.isEmpty {
                Section("Channels") {
                    ForEach(channels, id: \.id) { channel in
                        channelRow(channel)
                    }
                }
            }

            let dms = allChannels.filter { $0.isDM && !$0.isPinned }
            if !dms.isEmpty {
                Section("Direct Messages") {
                    ForEach(dms, id: \.id) { channel in
                        channelRow(channel)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Glab")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showCreateChannel = true } label: {
                        Label("New Channel", systemImage: "plus.bubble")
                    }
                    Button { showBrowseChannels = true } label: {
                        Label("Browse Channels", systemImage: "list.bullet.rectangle")
                    }
                    Divider()
                    Button("Mark All Read") {
                        Task { await viewModel?.markAllRead() }
                    }
                    Divider()
                    Button { showSections = true } label: {
                        Label("Manage Sections", systemImage: "folder")
                    }
                } label: {
                    Image(systemName: "square.and.pencil")
                        .accessibilityLabel("New message or channel")
                }
            }

            ToolbarItem(placement: .topBarLeading) {
                connectionStatusView
            }
        }
        .refreshable {
            await viewModel?.loadChannels()
        }
        .sheet(isPresented: $showBrowseChannels) {
            BrowseChannelsView()
                .environment(appState)
        }
        .sheet(isPresented: $showSections) {
            SectionsManagementView()
                .environment(appState)
        }
        .sheet(isPresented: $showCreateChannel) {
            CreateChannelView { channelID in
                selectedChannelID = channelID
            }
            .environment(appState)
        }
        .task {
            if syncEngine == nil {
                syncEngine = SyncEngine(modelContainer: modelContext.container)
            }
            if viewModel == nil {
                viewModel = SidebarViewModel(apiClient: appState.apiClient, syncEngine: syncEngine!)
            }
            appState.onChannelsNeedRefresh = { [weak viewModel] in
                await viewModel?.loadChannels()
            }
            await viewModel?.loadChannels()
        }
    }

    @ViewBuilder
    private var connectionStatusView: some View {
        switch appState.webSocketClient.state {
        case .connected:
            EmptyView()
        case .connecting:
            HStack(spacing: 4) {
                ProgressView().controlSize(.mini)
                Text("Connecting...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        case .disconnected:
            HStack(spacing: 4) {
                Circle().fill(.red).frame(width: 6, height: 6)
                Text("Offline")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func channelRow(_ channel: CachedChannel) -> some View {
        let presenceStatus: String? = if channel.isDM, let dmUserID = channel.dmUserID {
            appState.presenceService.status(for: dmUserID)
        } else {
            nil
        }

        return ChannelRowView(
            channel: channel,
            presenceStatus: presenceStatus,
            isSelected: selectedChannelID == channel.id
        )
        .tag(channel.id)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                Task { await viewModel?.hideChannel(id: channel.id) }
            } label: {
                Label("Hide", systemImage: "eye.slash")
            }
            .tint(.gray)

            Button {
                Task { await viewModel?.pinChannel(id: channel.id, pinned: !channel.isPinned) }
            } label: {
                Label(channel.isPinned ? "Unpin" : "Pin", systemImage: channel.isPinned ? "pin.slash" : "pin")
            }
            .tint(.orange)
        }
    }
}
