import SwiftUI
import SwiftData

@main
struct GlabApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var appState = AppState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.isAuthenticated {
                    MainView()
                } else {
                    LoginView()
                }
            }
            .environment(appState)
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .active: appState.handleForeground()
                case .background: appState.handleBackground()
                default: break
                }
            }
            .task {
                appDelegate.appState = appState
                if appState.tokenManager.isTokenValid {
                    await appState.restoreSession()
                }
            }
        }
        .modelContainer(for: [
            CachedChannel.self,
            CachedMessage.self,
            CachedReaction.self,
            CachedUser.self
        ])
    }
}

/// Main view after authentication.
struct MainView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var selectedChannelID: String?
    @State private var showProfile = false
    @State private var showAgentList = false
    @State private var pendingThreadMessageID: String?

    var body: some View {
        NavigationSplitView(columnVisibility: .constant(.all), preferredCompactColumn: .constant(.sidebar)) {
            SidebarView(selectedChannelID: $selectedChannelID)
                .toolbar {
                    ToolbarItem(placement: .bottomBar) {
                        HStack {
                            Button { showAgentList = true } label: {
                                Label("Agents", systemImage: "cpu")
                            }
                            Spacer()
                            Button { showProfile = true } label: {
                                Label("Profile", systemImage: "person.circle")
                            }
                        }
                    }
                }
        } detail: {
            if let channelID = selectedChannelID {
                ChatView(channelID: channelID)
                    .id(channelID)
                    .onAppear {
                        // Consume pending thread deep link — ChatView handles via appState
                        if pendingThreadMessageID != nil {
                            // Store in appState for ChatView to pick up
                            appState.pendingThreadMessageID = pendingThreadMessageID
                            pendingThreadMessageID = nil
                        }
                    }
            } else {
                ContentUnavailableView(
                    "Select a Channel",
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text("Choose a channel from the sidebar to start chatting")
                )
            }
        }
        .onChange(of: selectedChannelID) { _, newID in
            appState.activeChannelID = newID
            appState.eventRouter?.activeChannelID = newID
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
        .sheet(isPresented: $showProfile) {
            ProfileView()
                .environment(appState)
        }
        .sheet(isPresented: $showAgentList) {
            AgentListView()
                .environment(appState)
        }
        .task {
            appState.setupSyncEngine(container: modelContext.container)
            if appState.eventRouter == nil, appState.isAuthenticated {
                appState.startRealTime()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .navigateToChannel)) { notification in
            if let channelID = notification.userInfo?["channelID"] as? String {
                selectedChannelID = channelID
            }
        }
    }

    /// Handle deep links:
    /// - `glab://channel/{id}` — navigate to channel
    /// - `glab://channel/{id}/thread/{messageId}` — navigate to channel then open thread
    /// - `glab://search?q=term` — open search
    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "glab" else { return }

        switch url.host {
        case "channel":
            let components = url.pathComponents.filter { $0 != "/" }
            if let channelID = components.first {
                selectedChannelID = channelID
                // Thread deep link: glab://channel/{id}/thread/{messageId}
                if components.count >= 3, components[1] == "thread" {
                    pendingThreadMessageID = components[2]
                }
            }
        default:
            break
        }
    }
}
