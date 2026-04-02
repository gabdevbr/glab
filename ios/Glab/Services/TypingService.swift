import Foundation

/// Manages typing indicators — both sending and displaying.
@MainActor
@Observable
final class TypingService {
    /// Currently typing users per channel: [channelID: [userID: displayName]]
    private(set) var typingUsers: [String: [String: String]] = [:]

    private var clearTasks: [String: Task<Void, Never>] = [:]

    /// Update typing state from a WebSocket broadcast.
    func handleTypingEvent(_ payload: TypingBroadcastPayload) {
        let key = "\(payload.channelID):\(payload.userID)"

        if payload.isTyping {
            var channel = typingUsers[payload.channelID] ?? [:]
            channel[payload.userID] = payload.displayName
            typingUsers[payload.channelID] = channel

            // Auto-clear after 5 seconds
            clearTasks[key]?.cancel()
            let channelID = payload.channelID
            let userID = payload.userID
            clearTasks[key] = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                self?.removeTyping(channelID: channelID, userID: userID)
            }
        } else {
            removeTyping(channelID: payload.channelID, userID: payload.userID)
        }
    }

    /// Get display names of users currently typing in a channel, excluding the current user.
    func typingDisplayNames(channelID: String, excludingUserID: String) -> [String] {
        guard let channel = typingUsers[channelID] else { return [] }
        return channel
            .filter { $0.key != excludingUserID }
            .map(\.value)
            .sorted()
    }

    private func removeTyping(channelID: String, userID: String) {
        typingUsers[channelID]?.removeValue(forKey: userID)
        if typingUsers[channelID]?.isEmpty == true {
            typingUsers.removeValue(forKey: channelID)
        }
        clearTasks["\(channelID):\(userID)"]?.cancel()
        clearTasks.removeValue(forKey: "\(channelID):\(userID)")
    }
}
