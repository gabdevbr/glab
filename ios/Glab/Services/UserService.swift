import Foundation

/// Handles user-related operations.
struct UserService {
    let apiClient: APIClient

    func listUsers(limit: Int = 200) async throws -> [UserResponse] {
        try await apiClient.request(.listUsers(limit: limit))
    }

    func getUser(id: String) async throws -> UserResponse {
        try await apiClient.request(.getUser(id: id))
    }

    func updateProfile(id: String, displayName: String? = nil, email: String? = nil) async throws {
        var body: [String: Any] = [:]
        if let displayName { body["display_name"] = displayName }
        if let email { body["email"] = email }
        try await apiClient.requestVoid(.updateUser(id: id, body: body))
    }

    func updatePreferences(autoHideDays: Int? = nil, channelSort: String? = nil) async throws {
        var body: [String: Any] = [:]
        if let autoHideDays { body["auto_hide_days"] = autoHideDays }
        if let channelSort { body["channel_sort"] = channelSort }
        try await apiClient.requestVoid(.updatePreferences(body: body))
    }

    func uploadAvatar(userID: String, data: Data, filename: String, mimeType: String) async throws {
        let _: UserResponse = try await apiClient.upload(.uploadAvatar(userID: userID), fileData: data, fileName: filename, mimeType: mimeType)
    }
}
