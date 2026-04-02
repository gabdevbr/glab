import Foundation

/// WebSocket client with auto-reconnect and event streaming.
/// Built on URLSessionWebSocketTask — no third-party dependency.
@MainActor
@Observable
final class WebSocketClient {
    enum State: Equatable {
        case disconnected
        case connecting
        case connected
    }

    private(set) var state: State = .disconnected

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var url: URL?
    private var token: String?
    private var messageCounter = 0
    private var reconnectAttempt = 0
    private var reconnectTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var shouldReconnect = false

    // Pending ack continuations keyed by envelope ID
    private var pendingAcks: [String: CheckedContinuation<AckPayload, Error>] = [:]

    // Event stream for consumers
    private var eventContinuation: AsyncStream<WebSocketEnvelope>.Continuation?
    private(set) var events: AsyncStream<WebSocketEnvelope>!

    init() {
        setupEventStream()
    }

    private func setupEventStream() {
        events = AsyncStream { [weak self] continuation in
            self?.eventContinuation = continuation
        }
    }

    // MARK: - Connect / Disconnect

    func connect(serverURL: URL, token: String) {
        disconnect()
        self.token = token
        shouldReconnect = true

        var components = URLComponents(url: serverURL, resolvingAgainstBaseURL: false)!
        components.scheme = serverURL.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        self.url = components.url

        doConnect()
    }

    func disconnect() {
        shouldReconnect = false
        reconnectTask?.cancel()
        reconnectTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        state = .disconnected

        // Fail all pending acks
        for (_, continuation) in pendingAcks {
            continuation.resume(throwing: APIError.networkError(URLError(.cancelled)))
        }
        pendingAcks.removeAll()
    }

    // MARK: - Send

    /// Send a typed message and return the envelope ID for correlation.
    @discardableResult
    func send<T: Encodable>(_ type: String, payload: T) async throws -> String {
        messageCounter += 1
        let id = "ios-\(messageCounter)"
        guard let envelope = WebSocketEnvelope.make(type: type, id: id, payload: payload) else {
            throw APIError.badRequest("Failed to encode payload")
        }
        let data = try JSONEncoder().encode(envelope)
        guard let task, state == .connected else {
            throw APIError.networkError(URLError(.notConnectedToInternet))
        }
        try await task.send(.string(String(data: data, encoding: .utf8)!))
        return id
    }

    /// Send a message and await the ack response.
    func sendAndAwaitAck<T: Encodable>(_ type: String, payload: T) async throws -> AckPayload {
        let id = try await send(type, payload: payload)
        return try await withCheckedThrowingContinuation { continuation in
            pendingAcks[id] = continuation
        }
    }

    // MARK: - Internal Connection

    private func doConnect() {
        guard let url else { return }
        state = .connecting

        let session = URLSession(configuration: .default)
        self.session = session
        let task = session.webSocketTask(with: url)
        self.task = task
        task.resume()

        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }
    }

    private func receiveLoop() async {
        guard let task else { return }

        // Connection succeeded once we start receiving
        state = .connected
        reconnectAttempt = 0

        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    guard let data = text.data(using: .utf8) else { continue }
                    handleMessage(data)
                case .data(let data):
                    handleMessage(data)
                @unknown default:
                    break
                }
            } catch {
                if !Task.isCancelled {
                    state = .disconnected
                    scheduleReconnect()
                }
                return
            }
        }
    }

    private func handleMessage(_ data: Data) {
        guard let envelope = try? JSONDecoder().decode(WebSocketEnvelope.self, from: data) else { return }

        // Handle acks by resolving pending continuations
        if envelope.type == WSEvent.ack, let id = envelope.id, let continuation = pendingAcks.removeValue(forKey: id) {
            if let ack = envelope.decodePayload(AckPayload.self) {
                continuation.resume(returning: ack)
            } else {
                continuation.resume(throwing: APIError.decodingError(URLError(.cannotDecodeContentData)))
            }
            return
        }

        // Forward all other events to the stream
        eventContinuation?.yield(envelope)
    }

    // MARK: - Reconnect

    private func scheduleReconnect() {
        guard shouldReconnect else { return }
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            guard let self else { return }
            let delay = self.reconnectDelay()
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, self.shouldReconnect else { return }
            self.reconnectAttempt += 1
            self.doConnect()
        }
    }

    private func reconnectDelay() -> Double {
        let base = min(pow(2.0, Double(reconnectAttempt)), 30.0)
        let jitter = Double.random(in: 0...1)
        return base + jitter
    }

    /// Force an immediate reconnect (e.g. when app returns to foreground).
    func reconnectNow() {
        guard shouldReconnect, state == .disconnected else { return }
        reconnectAttempt = 0
        reconnectTask?.cancel()
        doConnect()
    }
}

// MARK: - Ack Payload

struct AckPayload: Decodable {
    let ok: Bool
    let error: String?
    let data: Data?

    enum CodingKeys: String, CodingKey {
        case ok, error, data
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        error = try container.decodeIfPresent(String.self, forKey: .error)
        // Keep data as raw JSON
        if container.contains(.data) {
            let raw = try container.decode(AnyCodablePublic.self, forKey: .data)
            data = try? JSONEncoder().encode(raw)
        } else {
            data = nil
        }
    }
}

// MARK: - Public AnyCodable for AckPayload

private struct AnyCodablePublic: Codable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { value = NSNull() }
        else if let v = try? container.decode(Bool.self) { value = v }
        else if let v = try? container.decode(Int.self) { value = v }
        else if let v = try? container.decode(Double.self) { value = v }
        else if let v = try? container.decode(String.self) { value = v }
        else if let v = try? container.decode([AnyCodablePublic].self) { value = v.map(\.value) }
        else if let v = try? container.decode([String: AnyCodablePublic].self) { value = v.mapValues(\.value) }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull: try container.encodeNil()
        case let v as Bool: try container.encode(v)
        case let v as Int: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as String: try container.encode(v)
        case let v as [Any]: try container.encode(v.map { AnyCodablePublic(value: $0) })
        case let v as [String: Any]: try container.encode(v.mapValues { AnyCodablePublic(value: $0) })
        default: break
        }
    }

    init(value: Any) { self.value = value }
}
