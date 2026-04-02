import Foundation
import SwiftData

@Model
final class CachedChannel {
    @Attribute(.unique) var id: String
    var name: String
    var slug: String
    var type: String
    var channelDescription: String?
    var topic: String?
    var createdBy: String
    var isArchived: Bool
    var readOnly: Bool
    var isPinned: Bool
    var unreadCount: Int
    var lastMessageAt: Date?
    var dmUserID: String?
    var sectionID: String?
    var memberCount: Int
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String,
        name: String,
        slug: String,
        type: String,
        channelDescription: String? = nil,
        topic: String? = nil,
        createdBy: String,
        isArchived: Bool = false,
        readOnly: Bool = false,
        isPinned: Bool = false,
        unreadCount: Int = 0,
        lastMessageAt: Date? = nil,
        dmUserID: String? = nil,
        sectionID: String? = nil,
        memberCount: Int = 0,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.slug = slug
        self.type = type
        self.channelDescription = channelDescription
        self.topic = topic
        self.createdBy = createdBy
        self.isArchived = isArchived
        self.readOnly = readOnly
        self.isPinned = isPinned
        self.unreadCount = unreadCount
        self.lastMessageAt = lastMessageAt
        self.dmUserID = dmUserID
        self.sectionID = sectionID
        self.memberCount = memberCount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var isDM: Bool { type == "dm" }
    var isPrivate: Bool { type == "private" }
    var isPublic: Bool { type == "public" }
}
