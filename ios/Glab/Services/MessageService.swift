import Foundation

/// Handles message operations (REST for history, WS for sending).
struct MessageService {
    let apiClient: APIClient

    func listMessages(channelID: String, limit: Int = 50, before: String? = nil) async throws -> [MessageResponse] {
        try await apiClient.request(.listMessages(channelID: channelID, limit: limit, before: before))
    }

    func pinnedMessages(channelID: String) async throws -> [MessageResponse] {
        try await apiClient.request(.pinnedMessages(channelID: channelID))
    }

    func threadMessages(messageID: String) async throws -> [MessageResponse] {
        try await apiClient.request(.threadMessages(messageID: messageID))
    }
}
