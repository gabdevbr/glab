import Foundation

/// Errors returned by the Glab API.
enum APIError: LocalizedError {
    case notConfigured
    case unauthorized
    case forbidden(String)
    case notFound
    case badRequest(String)
    case serverError(String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Server URL not configured"
        case .unauthorized:
            return "Session expired. Please log in again."
        case .forbidden(let msg):
            return msg
        case .notFound:
            return "Resource not found"
        case .badRequest(let msg):
            return msg
        case .serverError(let msg):
            return msg
        case .decodingError(let err):
            return "Failed to decode response: \(err.localizedDescription)"
        case .networkError(let err):
            return err.localizedDescription
        }
    }
}

/// The standard error JSON body from the backend: `{"error": "message"}`.
struct APIErrorResponse: Decodable {
    let error: String
}
