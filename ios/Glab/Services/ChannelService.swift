import Foundation

/// Handles channel REST operations.
struct ChannelService {
    let apiClient: APIClient

    func listChannels() async throws -> [ChannelResponse] {
        try await apiClient.request(.listChannels)
    }

    func browseChannels() async throws -> [ChannelResponse] {
        try await apiClient.request(.browseChannels)
    }

    func getChannel(id: String) async throws -> ChannelResponse {
        try await apiClient.request(.getChannel(id: id))
    }

    func createChannel(name: String, type: String, description: String? = nil, memberID: String? = nil) async throws -> ChannelResponse {
        var body: [String: Any] = ["name": name, "type": type]
        if let description { body["description"] = description }
        if let memberID { body["member_id"] = memberID }
        return try await apiClient.request(.createChannel(body: body))
    }

    func joinChannel(id: String) async throws {
        try await apiClient.requestVoid(.joinChannel(id: id))
    }

    func leaveChannel(id: String) async throws {
        try await apiClient.requestVoid(.leaveChannel(id: id))
    }

    func hideChannel(id: String, hidden: Bool) async throws {
        try await apiClient.requestVoid(.hideChannel(id: id, hidden: hidden))
    }

    func pinChannel(id: String, pinned: Bool) async throws {
        try await apiClient.requestVoid(.pinChannel(id: id, pinned: pinned))
    }

    func markAllRead() async throws {
        try await apiClient.requestVoid(.markAllRead)
    }
}
