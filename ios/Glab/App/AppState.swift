import Foundation
import SwiftData

/// Root application state. Holds auth status, services, and coordinates the app lifecycle.
@MainActor
@Observable
final class AppState {
    // Auth
    var isAuthenticated = false
    var currentUser: UserResponse?

    // Currently active channel (for routing new-message events)
    var activeChannelID: String?
    // Pending thread navigation from deep link
    var pendingThreadMessageID: String?

    // Services
    let tokenManager = TokenManager()
    private(set) var apiClient: APIClient!
    private(set) var webSocketClient = WebSocketClient()
    private(set) var presenceService = PresenceService()
    private(set) var typingService = TypingService()
    private(set) var pushService: PushNotificationService!
    private(set) var offlineQueue = OfflineQueue()

    // Event routing
    private(set) var eventRouter: EventRouter?
    private var syncEngine: SyncEngine?

    // Channel refresh callback — set by SidebarView
    var onChannelsNeedRefresh: (() async -> Void)?

    init() {
        apiClient = APIClient(tokenManager: tokenManager)
        pushService = PushNotificationService(apiClient: apiClient, tokenManager: tokenManager)
        isAuthenticated = tokenManager.isTokenValid
    }

    // MARK: - Setup SyncEngine (needs ModelContainer from SwiftUI)

    func setupSyncEngine(container: ModelContainer) {
        guard syncEngine == nil else { return }
        syncEngine = SyncEngine(modelContainer: container)
    }

    // MARK: - Auth

    func login(serverURL: URL, username: String, password: String) async throws {
        ServerEnvironment.serverURL = serverURL
        let response: LoginResponse = try await apiClient.request(.login(username: username, password: password))
        tokenManager.token = response.token
        currentUser = response.user
        isAuthenticated = true
        startRealTime()
        await pushService.requestPermission()
    }

    func restoreSession() async {
        guard tokenManager.isTokenValid else {
            logout()
            return
        }
        do {
            let user: UserResponse = try await apiClient.request(.me)
            currentUser = user
            isAuthenticated = true
            startRealTime()
            await pushService.requestPermission()
        } catch {
            logout()
        }
    }

    func logout() {
        Task { await pushService.unregister() }
        stopRealTime()
        tokenManager.clear()
        currentUser = nil
        isAuthenticated = false
        presenceService.clear()
        activeChannelID = nil
    }

    // MARK: - Real-Time

    func startRealTime() {
        guard let serverURL = ServerEnvironment.serverURL,
              let token = tokenManager.token else { return }

        // Connect WebSocket
        webSocketClient.connect(serverURL: serverURL, token: token)

        // Start event routing (requires syncEngine)
        guard let syncEngine else { return }

        let router = EventRouter(
            webSocketClient: webSocketClient,
            presenceService: presenceService,
            typingService: typingService,
            syncEngine: syncEngine
        )

        // Sync activeChannelID into router so it knows which channel is being viewed
        router.activeChannelID = activeChannelID

        router.onNewMessage = { [weak self] _ in
            // No need to refresh full channel list — SyncEngine handles unread increment.
            // Only refresh if needed for other sidebar updates.
            _ = self
        }

        router.start()
        eventRouter = router

        // Send presence online and flush offline queue
        Task {
            let payload = PresenceUpdatePayload(status: "online")
            try? await webSocketClient.send(WSEvent.presenceUpdate, payload: payload)
            _ = await offlineQueue.flush(via: webSocketClient)
        }
    }

    func stopRealTime() {
        eventRouter?.stop()
        eventRouter = nil
        webSocketClient.disconnect()
    }

    /// Called when app returns to foreground — reconnect and resync.
    func handleForeground() {
        guard isAuthenticated else { return }
        if webSocketClient.state == .disconnected {
            webSocketClient.reconnectNow()
            // Re-send presence online after reconnect
            Task {
                // Small delay to let WS connect
                try? await Task.sleep(for: .seconds(1))
                if webSocketClient.state == .connected {
                    let payload = PresenceUpdatePayload(status: "online")
                    try? await webSocketClient.send(WSEvent.presenceUpdate, payload: payload)
                }
                // Refresh channels to get accurate unread counts
                await onChannelsNeedRefresh?()
            }
        }
    }

    /// Called when app goes to background.
    func handleBackground() {
        // WS stays connected for a grace period (handled by the WS client reconnect logic).
        // Optionally send away status.
        guard isAuthenticated, webSocketClient.state == .connected else { return }
        Task {
            let payload = PresenceUpdatePayload(status: "away")
            try? await webSocketClient.send(WSEvent.presenceUpdate, payload: payload)
        }
    }
}
