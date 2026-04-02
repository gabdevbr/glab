import Foundation

/// Handles full-text search.
struct SearchService {
    let apiClient: APIClient

    func search(query: String, channelID: String? = nil, limit: Int = 50, offset: Int = 0) async throws -> [SearchResultResponse] {
        try await apiClient.request(.search(query: query, channelID: channelID, limit: limit, offset: offset))
    }
}
