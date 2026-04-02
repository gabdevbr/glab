import UIKit
import UserNotifications

/// UIApplicationDelegate to handle push notification token callbacks.
/// SwiftUI doesn't have native APIs for `didRegisterForRemoteNotificationsWithDeviceToken`.
class AppDelegate: NSObject, UIApplicationDelegate, @preconcurrency UNUserNotificationCenterDelegate {

    // Set by GlabApp on launch
    weak var appState: AppState?

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in
            appState?.pushService.didRegisterForRemoteNotifications(deviceToken: deviceToken)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in
            appState?.pushService.didFailToRegisterForRemoteNotifications(error: error)
        }
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Handle notification when app is in foreground — show it as a banner.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Don't show push if the user is viewing the channel the message is for
        let userInfo = notification.request.content.userInfo
        if let data = userInfo["data"] as? [String: String],
           let channelID = data["channel_id"],
           channelID == appState?.activeChannelID {
            completionHandler([]) // Suppress — user is already in this channel
        } else {
            completionHandler([.banner, .badge, .sound])
        }
    }

    /// Handle notification tap — navigate to the channel.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        Task { @MainActor in
            if let result = appState?.pushService.handleNotificationResponse(response) {
                appState?.activeChannelID = result.channelID
                // Post a notification for MainView to pick up
                NotificationCenter.default.post(
                    name: .navigateToChannel,
                    object: nil,
                    userInfo: ["channelID": result.channelID]
                )
            }
            completionHandler()
        }
    }
}

extension Notification.Name {
    static let navigateToChannel = Notification.Name("navigateToChannel")
}
