import Foundation

/// Describes every REST endpoint the iOS client calls.
/// Each case knows its HTTP method, path, query params, and body.
enum APIEndpoint {
    // MARK: - Auth
    case login(username: String, password: String)
    case logout
    case me
    case changePassword(currentPassword: String, newPassword: String)

    // MARK: - Users
    case listUsers(limit: Int = 50, offset: Int = 0)
    case getUser(id: String)
    case getUserByUsername(username: String)
    case updateUser(id: String, body: [String: Any])
    case updatePreferences(body: [String: Any])
    case uploadAvatar(userID: String)

    // MARK: - Channels
    case listChannels
    case browseChannels
    case hiddenChannels
    case markAllRead
    case createChannel(body: [String: Any])
    case getChannel(id: String)
    case updateChannel(id: String, body: [String: Any])
    case deleteChannel(id: String)
    case joinChannel(id: String)
    case leaveChannel(id: String)
    case hideChannel(id: String, hidden: Bool)
    case pinChannel(id: String, pinned: Bool)
    case addMember(channelID: String, userID: String)
    case removeMember(channelID: String, userID: String)

    // MARK: - Messages
    case listMessages(channelID: String, limit: Int = 50, before: String? = nil, after: String? = nil)
    case pinnedMessages(channelID: String)
    case threadMessages(messageID: String)

    // MARK: - Files
    case uploadFile(channelID: String)

    // MARK: - Search
    case search(query: String, channelID: String? = nil, limit: Int = 50, offset: Int = 0)

    // MARK: - Sections
    case listSections
    case createSection(name: String)
    case updateSection(id: String, name: String)
    case deleteSection(id: String)
    case reorderSections(sectionIDs: [String])
    case moveChannelToSection(channelID: String, sectionID: String?)

    // MARK: - Agents
    case listAgents
    case agentUnreadCounts
    case agentChannelMap
    case getAgent(slug: String)
    case agentSessions(slug: String)
    case agentSessionMessages(slug: String, sessionID: String)

    // MARK: - Devices (Push Notifications)
    case registerDevice(token: String, platform: String)
    case unregisterDevice(token: String)

    // MARK: - Custom Emoji
    case listCustomEmojis

    // MARK: - Giphy
    case giphySearch(query: String, limit: Int = 25, offset: Int = 0)
    case giphyTrending(limit: Int = 25, offset: Int = 0)

    // MARK: - Admin
    case adminStats
    case adminListUsers(limit: Int = 50, offset: Int = 0, search: String? = nil)
    case adminCreateUser(body: [String: Any])
    case adminDeactivateUser(id: String)
    case adminChangeRole(id: String, role: String)
    case adminResetPassword(id: String, password: String)
    case adminRetentionConfig
    case adminUpdateRetention(defaultDays: Int, minimumDays: Int)
    case adminEditTimeoutConfig
    case adminUpdateEditTimeout(seconds: Int)
    case adminAIConfig
    case adminUpdateAIConfig(body: [String: Any])

    // MARK: - Computed Properties

    var method: String {
        switch self {
        case .login, .logout, .changePassword, .markAllRead, .createChannel, .joinChannel,
             .leaveChannel, .addMember, .uploadFile, .createSection, .uploadAvatar,
             .adminCreateUser, .adminResetPassword, .registerDevice:
            return "POST"
        case .updateUser, .updatePreferences, .updateChannel, .hideChannel, .pinChannel,
             .updateSection, .moveChannelToSection, .adminChangeRole:
            return "PATCH"
        case .reorderSections, .adminUpdateRetention, .adminUpdateEditTimeout, .adminUpdateAIConfig:
            return "PUT"
        case .deleteChannel, .removeMember, .deleteSection, .adminDeactivateUser, .unregisterDevice:
            return "DELETE"
        default:
            return "GET"
        }
    }

    var path: String {
        switch self {
        // Auth
        case .login: return "/api/v1/auth/login"
        case .logout: return "/api/v1/auth/logout"
        case .me: return "/api/v1/auth/me"
        case .changePassword: return "/api/v1/auth/change-password"

        // Users
        case .listUsers: return "/api/v1/users"
        case .getUser(let id): return "/api/v1/users/\(id)"
        case .getUserByUsername(let username): return "/api/v1/users/by-username/\(username)"
        case .updateUser(let id, _): return "/api/v1/users/\(id)"
        case .updatePreferences: return "/api/v1/users/me/preferences"
        case .uploadAvatar(let id): return "/api/v1/users/\(id)/avatar"

        // Channels
        case .listChannels: return "/api/v1/channels"
        case .browseChannels: return "/api/v1/channels/browse"
        case .hiddenChannels: return "/api/v1/channels/hidden"
        case .markAllRead: return "/api/v1/channels/mark-all-read"
        case .createChannel: return "/api/v1/channels"
        case .getChannel(let id): return "/api/v1/channels/\(id)"
        case .updateChannel(let id, _): return "/api/v1/channels/\(id)"
        case .deleteChannel(let id): return "/api/v1/channels/\(id)"
        case .joinChannel(let id): return "/api/v1/channels/\(id)/join"
        case .leaveChannel(let id): return "/api/v1/channels/\(id)/leave"
        case .hideChannel(let id, _): return "/api/v1/channels/\(id)/hide"
        case .pinChannel(let id, _): return "/api/v1/channels/\(id)/pin"
        case .addMember(let id, _): return "/api/v1/channels/\(id)/members"
        case .removeMember(let channelID, let userID): return "/api/v1/channels/\(channelID)/members/\(userID)"

        // Messages
        case .listMessages(let channelID, _, _, _): return "/api/v1/channels/\(channelID)/messages"
        case .pinnedMessages(let channelID): return "/api/v1/channels/\(channelID)/messages/pinned"
        case .threadMessages(let messageID): return "/api/v1/messages/\(messageID)/thread"

        // Files
        case .uploadFile(let channelID): return "/api/v1/channels/\(channelID)/upload"

        // Search
        case .search: return "/api/v1/search"

        // Sections
        case .listSections: return "/api/v1/sections"
        case .createSection: return "/api/v1/sections"
        case .updateSection(let id, _): return "/api/v1/sections/\(id)"
        case .deleteSection(let id): return "/api/v1/sections/\(id)"
        case .reorderSections: return "/api/v1/sections/reorder"
        case .moveChannelToSection: return "/api/v1/sections/move-channel"

        // Agents
        case .listAgents: return "/api/v1/agents"
        case .agentUnreadCounts: return "/api/v1/agents/unread"
        case .agentChannelMap: return "/api/v1/agents/channel-map"
        case .getAgent(let slug): return "/api/v1/agents/\(slug)"
        case .agentSessions(let slug): return "/api/v1/agents/\(slug)/sessions"
        case .agentSessionMessages(let slug, let sessionID): return "/api/v1/agents/\(slug)/sessions/\(sessionID)/messages"

        // Devices
        case .registerDevice: return "/api/v1/devices"
        case .unregisterDevice(let token): return "/api/v1/devices/\(token)"

        // Custom Emoji
        case .listCustomEmojis: return "/api/v1/emojis/custom"

        // Giphy
        case .giphySearch: return "/api/v1/giphy/search"
        case .giphyTrending: return "/api/v1/giphy/trending"

        // Admin
        case .adminStats: return "/api/v1/admin/stats"
        case .adminListUsers: return "/api/v1/admin/users"
        case .adminCreateUser: return "/api/v1/admin/users"
        case .adminDeactivateUser(let id): return "/api/v1/admin/users/\(id)"
        case .adminChangeRole(let id, _): return "/api/v1/admin/users/\(id)/role"
        case .adminResetPassword(let id, _): return "/api/v1/admin/users/\(id)/reset-password"
        case .adminRetentionConfig: return "/api/v1/admin/retention"
        case .adminUpdateRetention: return "/api/v1/admin/retention"
        case .adminEditTimeoutConfig: return "/api/v1/admin/message-edit"
        case .adminUpdateEditTimeout: return "/api/v1/admin/message-edit"
        case .adminAIConfig: return "/api/v1/admin/ai/config"
        case .adminUpdateAIConfig: return "/api/v1/admin/ai/config"
        }
    }

    var queryItems: [URLQueryItem]? {
        switch self {
        case .listUsers(let limit, let offset):
            return [.init(name: "limit", value: "\(limit)"), .init(name: "offset", value: "\(offset)")]
        case .listMessages(_, let limit, let before, let after):
            var items: [URLQueryItem] = [.init(name: "limit", value: "\(limit)")]
            if let before { items.append(.init(name: "before", value: before)) }
            if let after { items.append(.init(name: "after", value: after)) }
            return items
        case .search(let query, let channelID, let limit, let offset):
            var items: [URLQueryItem] = [
                .init(name: "q", value: query),
                .init(name: "limit", value: "\(limit)"),
                .init(name: "offset", value: "\(offset)")
            ]
            if let channelID { items.append(.init(name: "channel_id", value: channelID)) }
            return items
        case .giphySearch(let query, let limit, let offset):
            return [
                .init(name: "q", value: query),
                .init(name: "limit", value: "\(limit)"),
                .init(name: "offset", value: "\(offset)")
            ]
        case .giphyTrending(let limit, let offset):
            return [.init(name: "limit", value: "\(limit)"), .init(name: "offset", value: "\(offset)")]
        case .adminListUsers(let limit, let offset, let search):
            var items: [URLQueryItem] = [
                .init(name: "limit", value: "\(limit)"),
                .init(name: "offset", value: "\(offset)")
            ]
            if let search { items.append(.init(name: "search", value: search)) }
            return items
        default:
            return nil
        }
    }

    var body: Data? {
        let dict: [String: Any]?
        switch self {
        case .login(let username, let password):
            dict = ["username": username, "password": password]
        case .changePassword(let current, let new):
            dict = ["current_password": current, "new_password": new]
        case .createChannel(let body), .updateChannel(_, let body), .updateUser(_, let body),
             .updatePreferences(let body), .adminCreateUser(let body), .adminUpdateAIConfig(let body):
            dict = body
        case .hideChannel(_, let hidden):
            dict = ["hidden": hidden]
        case .pinChannel(_, let pinned):
            dict = ["pinned": pinned]
        case .addMember(_, let userID):
            dict = ["user_id": userID]
        case .createSection(let name):
            dict = ["name": name]
        case .updateSection(_, let name):
            dict = ["name": name]
        case .reorderSections(let ids):
            dict = ["section_ids": ids]
        case .moveChannelToSection(let channelID, let sectionID):
            var d: [String: Any] = ["channel_id": channelID]
            if let sectionID { d["section_id"] = sectionID }
            return try? JSONSerialization.data(withJSONObject: d)
        case .adminChangeRole(_, let role):
            dict = ["role": role]
        case .adminResetPassword(_, let password):
            dict = ["password": password]
        case .adminUpdateRetention(let defaultDays, let minimumDays):
            dict = ["default_days": defaultDays, "minimum_days": minimumDays]
        case .adminUpdateEditTimeout(let seconds):
            dict = ["seconds": seconds]
        case .registerDevice(let token, let platform):
            dict = ["token": token, "platform": platform]
        default:
            dict = nil
        }
        guard let dict else { return nil }
        return try? JSONSerialization.data(withJSONObject: dict)
    }

    /// Whether this endpoint requires authentication.
    var requiresAuth: Bool {
        switch self {
        case .login:
            return false
        default:
            return true
        }
    }
}
