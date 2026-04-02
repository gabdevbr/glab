import Foundation
import SwiftData

@Model
final class CachedMessage {
    @Attribute(.unique) var id: String
    var channelID: String
    var userID: String
    var threadID: String?
    var content: String
    var contentType: String
    var username: String
    var displayName: String
    var avatarURL: String?
    var isBot: Bool
    var isPinned: Bool
    var editedAt: Date?
    var createdAt: Date

    // Thread summary (denormalized from backend)
    var threadReplyCount: Int
    var threadLastReplyAt: Date?

    // Denormalized file info (avoids separate table for simple use case)
    var fileID: String?
    var fileName: String?
    var fileOriginalName: String?
    var fileMimeType: String?
    var fileSizeBytes: Int64?
    var fileHasThumbnail: Bool?

    init(
        id: String,
        channelID: String,
        userID: String,
        threadID: String? = nil,
        content: String,
        contentType: String = "text",
        username: String,
        displayName: String,
        avatarURL: String? = nil,
        isBot: Bool = false,
        isPinned: Bool = false,
        editedAt: Date? = nil,
        createdAt: Date = .now,
        threadReplyCount: Int = 0,
        threadLastReplyAt: Date? = nil,
        fileID: String? = nil,
        fileName: String? = nil,
        fileOriginalName: String? = nil,
        fileMimeType: String? = nil,
        fileSizeBytes: Int64? = nil,
        fileHasThumbnail: Bool? = nil
    ) {
        self.id = id
        self.channelID = channelID
        self.userID = userID
        self.threadID = threadID
        self.content = content
        self.contentType = contentType
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.isBot = isBot
        self.isPinned = isPinned
        self.editedAt = editedAt
        self.createdAt = createdAt
        self.threadReplyCount = threadReplyCount
        self.threadLastReplyAt = threadLastReplyAt
        self.fileID = fileID
        self.fileName = fileName
        self.fileOriginalName = fileOriginalName
        self.fileMimeType = fileMimeType
        self.fileSizeBytes = fileSizeBytes
        self.fileHasThumbnail = fileHasThumbnail
    }

    var isFile: Bool { contentType == "file" }
    var isSystem: Bool { contentType == "system" }
    var isThreadReply: Bool { threadID != nil && !threadID!.isEmpty }
    var isImage: Bool { fileMimeType?.hasPrefix("image/") == true }
}
