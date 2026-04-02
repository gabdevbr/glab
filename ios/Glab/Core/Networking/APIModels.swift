import Foundation

// MARK: - Auth

struct LoginRequest: Encodable {
    let username: String
    let password: String
}

struct LoginResponse: Decodable {
    let token: String
    let user: UserResponse
}

// MARK: - User

struct UserResponse: Decodable, Identifiable, Hashable {
    let id: String
    let username: String
    let email: String
    let displayName: String
    let avatarURL: String?
    let role: String
    let status: String
    let lastSeen: String?
    let isBot: Bool
    let autoHideDays: Int
    let channelSort: String
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, username, email, role, status, lastSeen = "last_seen"
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case isBot = "is_bot"
        case autoHideDays = "auto_hide_days"
        case channelSort = "channel_sort"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Channel

struct ChannelResponse: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String
    let description: String?
    let type: String
    let topic: String?
    let createdBy: String
    let isArchived: Bool
    let readOnly: Bool
    let retentionDays: Int?
    let lastMessageAt: String?
    let createdAt: String
    let updatedAt: String
    let memberCount: Int?
    let unreadCount: Int
    let isPinned: Bool
    let dmUserID: String?

    enum CodingKeys: String, CodingKey {
        case id, name, slug, description, type, topic
        case createdBy = "created_by"
        case isArchived = "is_archived"
        case readOnly = "read_only"
        case retentionDays = "retention_days"
        case lastMessageAt = "last_message_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case memberCount = "member_count"
        case unreadCount = "unread_count"
        case isPinned = "is_pinned"
        case dmUserID = "dm_user_id"
    }

    var isDM: Bool { type == "dm" }
    var isPrivate: Bool { type == "private" }
    var isPublic: Bool { type == "public" }
}

// MARK: - Message

struct MessageResponse: Decodable, Identifiable, Hashable {
    let id: String
    let channelID: String
    let userID: String
    let threadID: String?
    let content: String
    let contentType: String
    let editedAt: String?
    let isPinned: Bool
    let createdAt: String
    let updatedAt: String
    let username: String
    let displayName: String
    let avatarURL: String?
    let isBot: Bool
    let file: FileResponse?
    let reactions: [ReactionResponse]

    enum CodingKeys: String, CodingKey {
        case id, content, username, file, reactions
        case channelID = "channel_id"
        case userID = "user_id"
        case threadID = "thread_id"
        case contentType = "content_type"
        case editedAt = "edited_at"
        case isPinned = "is_pinned"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case isBot = "is_bot"
    }

    static func == (lhs: MessageResponse, rhs: MessageResponse) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var isFile: Bool { contentType == "file" }
    var isSystem: Bool { contentType == "system" }
    var isThreadReply: Bool { threadID != nil && !threadID!.isEmpty }
}

// MARK: - Reaction

struct ReactionResponse: Decodable, Hashable {
    let emoji: String
    let userID: String
    let username: String

    enum CodingKeys: String, CodingKey {
        case emoji, username
        case userID = "user_id"
    }
}

// MARK: - File

struct FileResponse: Decodable, Identifiable, Hashable {
    let id: String
    let messageID: String?
    let userID: String
    let channelID: String
    let filename: String
    let originalName: String
    let mimeType: String
    let sizeBytes: Int64
    let hasThumbnail: Bool
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, filename
        case messageID = "message_id"
        case userID = "user_id"
        case channelID = "channel_id"
        case originalName = "original_name"
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
        case hasThumbnail = "has_thumbnail"
        case createdAt = "created_at"
    }

    var isImage: Bool { mimeType.hasPrefix("image/") }

    /// Full file URL (public, no auth needed).
    func fileURL(serverURL: URL) -> URL {
        serverURL.appendingPathComponent("/api/v1/files/\(id)")
    }

    /// Thumbnail URL (images only).
    func thumbnailURL(serverURL: URL) -> URL {
        serverURL.appendingPathComponent("/api/v1/files/\(id)/thumbnail")
    }
}

// MARK: - Section

struct SectionResponse: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let position: Int
    let channelIDs: [String]

    enum CodingKeys: String, CodingKey {
        case id, name, position
        case channelIDs = "channel_ids"
    }
}

// MARK: - Search Result

struct SearchResultResponse: Decodable, Identifiable, Hashable {
    let id: String
    let channelID: String
    let userID: String
    let content: String
    let contentType: String
    let createdAt: String
    let username: String
    let displayName: String
    let avatarURL: String?
    let isBot: Bool
    let rank: Float

    enum CodingKeys: String, CodingKey {
        case id, content, username, rank
        case channelID = "channel_id"
        case userID = "user_id"
        case contentType = "content_type"
        case createdAt = "created_at"
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case isBot = "is_bot"
    }
}

// MARK: - Agent

struct AgentResponse: Decodable, Identifiable, Hashable {
    let id: String
    let userID: String
    let slug: String
    let name: String
    let emoji: String
    let description: String?
    let scope: String?
    let status: String
    let category: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, slug, name, emoji, description, scope, status, category
        case userID = "user_id"
        case createdAt = "created_at"
    }
}

// MARK: - Agent Session

struct AgentSessionResponse: Decodable, Identifiable, Hashable {
    let id: String
    let agentID: String
    let userID: String
    let title: String
    let isActive: Bool
    let channelID: String?
    let lastAgentMessage: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, title
        case agentID = "agent_id"
        case userID = "user_id"
        case isActive = "is_active"
        case channelID = "channel_id"
        case lastAgentMessage = "last_agent_message"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - WebSocket Payloads (Server → Client)

struct HelloPayload: Decodable {
    let userID: String
    let username: String
    let version: String

    enum CodingKeys: String, CodingKey {
        case username, version
        case userID = "user_id"
    }
}

struct MessageNewPayload: Decodable {
    let id: String
    let channelID: String
    let userID: String
    let username: String
    let displayName: String
    let avatarURL: String?
    let content: String
    let contentType: String
    let threadID: String?
    let isBot: Bool
    let createdAt: String
    let file: FilePayload?

    enum CodingKeys: String, CodingKey {
        case id, content, username, file
        case channelID = "channel_id"
        case userID = "user_id"
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case contentType = "content_type"
        case threadID = "thread_id"
        case isBot = "is_bot"
        case createdAt = "created_at"
    }
}

struct FilePayload: Decodable {
    let id: String
    let messageID: String?
    let userID: String
    let channelID: String
    let filename: String
    let originalName: String
    let mimeType: String
    let sizeBytes: Int64
    let hasThumbnail: Bool
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, filename
        case messageID = "message_id"
        case userID = "user_id"
        case channelID = "channel_id"
        case originalName = "original_name"
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
        case hasThumbnail = "has_thumbnail"
        case createdAt = "created_at"
    }
}

struct MessageEditedPayload: Decodable {
    let id: String
    let channelID: String
    let content: String
    let editedAt: String

    enum CodingKeys: String, CodingKey {
        case id, content
        case channelID = "channel_id"
        case editedAt = "edited_at"
    }
}

struct MessageDeletedPayload: Decodable {
    let id: String
    let channelID: String

    enum CodingKeys: String, CodingKey {
        case id
        case channelID = "channel_id"
    }
}

struct TypingBroadcastPayload: Decodable {
    let channelID: String
    let userID: String
    let username: String
    let displayName: String
    let isTyping: Bool

    enum CodingKeys: String, CodingKey {
        case username
        case channelID = "channel_id"
        case userID = "user_id"
        case displayName = "display_name"
        case isTyping = "is_typing"
    }
}

struct PresenceBroadcastPayload: Decodable {
    let userID: String
    let username: String
    let status: String

    enum CodingKeys: String, CodingKey {
        case username, status
        case userID = "user_id"
    }
}

struct ReactionUpdatedPayload: Decodable {
    let messageID: String
    let channelID: String
    let emoji: String
    let userID: String
    let username: String
    let action: String // "add" or "remove"

    enum CodingKeys: String, CodingKey {
        case emoji, username, action
        case messageID = "message_id"
        case channelID = "channel_id"
        case userID = "user_id"
    }
}

struct ThreadUpdatedPayload: Decodable {
    let messageID: String
    let channelID: String
    let replyCount: Int
    let lastReplyAt: String

    enum CodingKeys: String, CodingKey {
        case messageID = "message_id"
        case channelID = "channel_id"
        case replyCount = "reply_count"
        case lastReplyAt = "last_reply_at"
    }
}

struct NotificationPayload: Decodable {
    let type: String
    let messageID: String
    let channelID: String
    let from: String
    let content: String

    enum CodingKeys: String, CodingKey {
        case type, from, content
        case messageID = "message_id"
        case channelID = "channel_id"
    }
}

struct AIChunkPayload: Decodable {
    let channelID: String
    let agentSlug: String
    let agentName: String
    let agentEmoji: String
    let content: String
    let done: Bool
    let messageID: String?

    enum CodingKeys: String, CodingKey {
        case content, done
        case channelID = "channel_id"
        case agentSlug = "agent_slug"
        case agentName = "agent_name"
        case agentEmoji = "agent_emoji"
        case messageID = "message_id"
    }
}

struct AIPanelChunkPayload: Decodable {
    let agentSlug: String
    let sessionID: String
    let content: String
    let done: Bool
    let messageID: String?

    enum CodingKeys: String, CodingKey {
        case content, done
        case agentSlug = "agent_slug"
        case sessionID = "session_id"
        case messageID = "message_id"
    }
}

// MARK: - WebSocket Payloads (Client → Server)

struct MessageSendPayload: Encodable {
    let channelID: String
    let content: String
    let threadID: String?

    enum CodingKeys: String, CodingKey {
        case content
        case channelID = "channel_id"
        case threadID = "thread_id"
    }
}

struct MessageEditPayload: Encodable {
    let messageID: String
    let content: String

    enum CodingKeys: String, CodingKey {
        case content
        case messageID = "message_id"
    }
}

struct MessageDeletePayload: Encodable {
    let messageID: String

    enum CodingKeys: String, CodingKey {
        case messageID = "message_id"
    }
}

struct PinPayload: Codable {
    let messageID: String

    enum CodingKeys: String, CodingKey {
        case messageID = "message_id"
    }
}

struct ReactionPayload: Encodable {
    let messageID: String
    let emoji: String

    enum CodingKeys: String, CodingKey {
        case emoji
        case messageID = "message_id"
    }
}

struct TypingPayload: Encodable {
    let channelID: String

    enum CodingKeys: String, CodingKey {
        case channelID = "channel_id"
    }
}

struct PresenceUpdatePayload: Encodable {
    let status: String
}

struct ChannelReadPayload: Codable {
    let channelID: String
    let messageID: String

    enum CodingKeys: String, CodingKey {
        case channelID = "channel_id"
        case messageID = "message_id"
    }
}

struct SubscribePayload: Encodable {
    let channelIDs: [String]

    enum CodingKeys: String, CodingKey {
        case channelIDs = "channel_ids"
    }
}

struct AIPromptPayload: Encodable {
    let agentSlug: String
    let sessionID: String?
    let content: String

    enum CodingKeys: String, CodingKey {
        case content
        case agentSlug = "agent_slug"
        case sessionID = "session_id"
    }
}

struct AIStopPayload: Encodable {
    let agentSlug: String
    let channelID: String?

    enum CodingKeys: String, CodingKey {
        case agentSlug = "agent_slug"
        case channelID = "channel_id"
    }
}
