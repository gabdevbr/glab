import Foundation

/// Wire format for all WebSocket messages — matches the Go `ws.Envelope` struct.
struct WebSocketEnvelope: Codable {
    let type: String
    var id: String?
    var payload: Data?

    enum CodingKeys: String, CodingKey {
        case type, id, payload
    }

    init(type: String, id: String? = nil, payload: Data? = nil) {
        self.type = type
        self.id = id
        self.payload = payload
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(String.self, forKey: .type)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        // payload is raw JSON — keep it as Data for deferred decoding
        if container.contains(.payload) {
            let raw = try container.decode(AnyCodable.self, forKey: .payload)
            payload = try JSONEncoder().encode(raw)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(id, forKey: .id)
        if let payload {
            let raw = try JSONDecoder().decode(AnyCodable.self, from: payload)
            try container.encode(raw, forKey: .payload)
        }
    }

    /// Decode the payload into a specific type.
    func decodePayload<T: Decodable>(_ type: T.Type) -> T? {
        guard let payload else { return nil }
        return try? JSONDecoder().decode(type, from: payload)
    }
}

/// Helper to create an outgoing envelope with a typed payload.
extension WebSocketEnvelope {
    static func make<T: Encodable>(type: String, id: String? = nil, payload: T) -> WebSocketEnvelope? {
        guard let data = try? JSONEncoder().encode(payload) else { return nil }
        return WebSocketEnvelope(type: type, id: id, payload: data)
    }
}

// MARK: - Event Type Constants

enum WSEvent {
    // Client → Server
    static let messageSend = "message.send"
    static let messageEdit = "message.edit"
    static let messageDelete = "message.delete"
    static let messagePin = "message.pin"
    static let messageUnpin = "message.unpin"
    static let reactionAdd = "reaction.add"
    static let reactionRemove = "reaction.remove"
    static let typingStart = "typing.start"
    static let typingStop = "typing.stop"
    static let presenceUpdate = "presence.update"
    static let channelRead = "channel.read"
    static let subscribe = "subscribe"
    static let unsubscribe = "unsubscribe"
    static let aiPrompt = "ai.prompt"
    static let aiStop = "ai.stop"

    // Server → Client
    static let ack = "ack"
    static let hello = "hello"
    static let messageNew = "message.new"
    static let messageEdited = "message.edited"
    static let messageDeleted = "message.deleted"
    static let messagePinned = "message.pinned"
    static let messageUnpinned = "message.unpinned"
    static let reactionUpdated = "reaction.updated"
    static let threadUpdated = "thread.updated"
    static let typing = "typing"
    static let presence = "presence"
    static let notification = "notification"
    static let aiChunk = "ai.chunk"
    static let aiPanelChunk = "ai.panel.chunk"
}

// MARK: - AnyCodable helper for raw JSON pass-through

/// A type-erased Codable wrapper so we can round-trip arbitrary JSON.
private struct AnyCodable: Codable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map(\.value)
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues(\.value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable(value: $0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable(value: $0) })
        default:
            throw EncodingError.invalidValue(value, .init(codingPath: [], debugDescription: "Unsupported type"))
        }
    }

    init(value: Any) {
        self.value = value
    }
}
