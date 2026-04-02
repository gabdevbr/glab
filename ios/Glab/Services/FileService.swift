import Foundation

/// Handles file upload operations and URL construction.
struct FileService {
    let apiClient: APIClient

    func upload(channelID: String, data: Data, filename: String, mimeType: String) async throws -> FileResponse {
        try await apiClient.upload(.uploadFile(channelID: channelID), fileData: data, fileName: filename, mimeType: mimeType)
    }

    /// Build a full file URL for downloading.
    static func fileURL(id: String) -> URL? {
        ServerEnvironment.serverURL?.appendingPathComponent("/api/v1/files/\(id)")
    }

    /// Build a thumbnail URL.
    static func thumbnailURL(id: String) -> URL? {
        ServerEnvironment.serverURL?.appendingPathComponent("/api/v1/files/\(id)/thumbnail")
    }
}
