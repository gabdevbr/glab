import Foundation
import UIKit
import UserNotifications

/// Manages push notification registration, permission, and device token sync with the backend.
@MainActor
@Observable
final class PushNotificationService: NSObject {
    var isPermissionGranted = false
    var deviceToken: String?

    private let apiClient: APIClient
    private let tokenManager: TokenManager

    init(apiClient: APIClient, tokenManager: TokenManager) {
        self.apiClient = apiClient
        self.tokenManager = tokenManager
        super.init()
    }

    /// Request notification permission and register for remote notifications.
    func requestPermission() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            isPermissionGranted = granted
            if granted {
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        } catch {
            isPermissionGranted = false
        }
    }

    /// Called when iOS provides the APNs device token.
    func didRegisterForRemoteNotifications(deviceToken data: Data) {
        let token = data.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = token
        Task { await registerWithBackend(token: token) }
    }

    /// Called when registration fails.
    func didFailToRegisterForRemoteNotifications(error: Error) {
        deviceToken = nil
    }

    /// Send device token to backend.
    private func registerWithBackend(token: String) async {
        guard tokenManager.isTokenValid else { return }
        try? await apiClient.requestVoid(.registerDevice(token: token, platform: "ios"))
    }

    /// Unregister device token on logout.
    func unregister() async {
        guard let token = deviceToken else { return }
        try? await apiClient.requestVoid(.unregisterDevice(token: token))
        deviceToken = nil
    }

    /// Handle a push notification tap — extract channel ID for navigation.
    func handleNotificationResponse(_ response: UNNotificationResponse) -> (channelID: String, messageID: String?)? {
        let userInfo = response.notification.request.content.userInfo
        guard let data = userInfo["data"] as? [String: String],
              let channelID = data["channel_id"] else { return nil }
        return (channelID, data["message_id"])
    }
}
