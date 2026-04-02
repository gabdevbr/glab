import Foundation

/// Tracks user presence status in memory from WebSocket events.
@MainActor
@Observable
final class PresenceService {
    private(set) var statuses: [String: String] = [:] // userID → status

    func update(userID: String, status: String) {
        statuses[userID] = status
    }

    func status(for userID: String) -> String {
        statuses[userID] ?? "offline"
    }

    func isOnline(_ userID: String) -> Bool {
        let s = status(for: userID)
        return s == "online" || s == "away" || s == "dnd"
    }

    func clear() {
        statuses.removeAll()
    }
}
