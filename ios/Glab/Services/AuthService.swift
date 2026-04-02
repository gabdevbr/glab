import Foundation

/// Handles authentication operations.
struct AuthService {
    let apiClient: APIClient

    func login(username: String, password: String) async throws -> LoginResponse {
        try await apiClient.request(.login(username: username, password: password))
    }

    func fetchCurrentUser() async throws -> UserResponse {
        try await apiClient.request(.me)
    }

    func changePassword(current: String, new: String) async throws {
        try await apiClient.requestVoid(.changePassword(currentPassword: current, newPassword: new))
    }
}
