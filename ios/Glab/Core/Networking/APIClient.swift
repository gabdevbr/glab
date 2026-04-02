import Foundation

/// Actor-isolated REST client for the Glab API.
/// All requests are async/await and automatically inject the JWT token.
actor APIClient {
    let tokenManager: TokenManager
    private let session: URLSession
    private let decoder: JSONDecoder

    init(tokenManager: TokenManager) {
        self.tokenManager = tokenManager
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    // MARK: - Generic Request

    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        let request = try buildRequest(for: endpoint)
        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// For endpoints that return no meaningful body (e.g. logout, mark-all-read).
    func requestVoid(_ endpoint: APIEndpoint) async throws {
        let request = try buildRequest(for: endpoint)
        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
    }

    /// Upload a file via multipart form data.
    func upload<T: Decodable>(
        _ endpoint: APIEndpoint,
        fileData: Data,
        fileName: String,
        mimeType: String
    ) async throws -> T {
        guard let url = buildURL(for: endpoint) else {
            throw APIError.notConfigured
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method

        if endpoint.requiresAuth {
            guard let token = tokenManager.token else { throw APIError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Internals

    private func buildURL(for endpoint: APIEndpoint) -> URL? {
        guard var components = ServerEnvironment.apiURL(path: endpoint.path)
                .flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) }) else {
            return nil
        }
        if let items = endpoint.queryItems {
            components.queryItems = items
        }
        return components.url
    }

    private func buildRequest(for endpoint: APIEndpoint) throws -> URLRequest {
        guard let url = buildURL(for: endpoint) else {
            throw APIError.notConfigured
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method

        if endpoint.requiresAuth {
            guard let token = tokenManager.token else { throw APIError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = endpoint.body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.networkError(URLError(.badServerResponse))
            }
            return (data, httpResponse)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
        }
    }

    private func validateResponse(_ response: HTTPURLResponse, data: Data) throws {
        switch response.statusCode {
        case 200...299:
            return
        case 401:
            throw APIError.unauthorized
        case 403:
            let msg = (try? decoder.decode(APIErrorResponse.self, from: data))?.error ?? "Forbidden"
            throw APIError.forbidden(msg)
        case 404:
            throw APIError.notFound
        case 400:
            let msg = (try? decoder.decode(APIErrorResponse.self, from: data))?.error ?? "Bad request"
            throw APIError.badRequest(msg)
        default:
            let msg = (try? decoder.decode(APIErrorResponse.self, from: data))?.error ?? "Server error"
            throw APIError.serverError(msg)
        }
    }
}
