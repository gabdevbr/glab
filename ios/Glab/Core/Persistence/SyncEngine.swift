import Foundation
import SwiftData

/// Merges REST API responses and WebSocket events into SwiftData.
@ModelActor
actor SyncEngine {

    // MARK: - Channels

    func syncChannels(_ channels: [ChannelResponse]) throws {
        let context = modelContext
        let existing = try context.fetch(FetchDescriptor<CachedChannel>())
        let existingByID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })
        let remoteIDs = Set(channels.map(\.id))

        for ch in channels {
            if let cached = existingByID[ch.id] {
                updateChannel(cached, from: ch)
            } else {
                let cached = CachedChannel(
                    id: ch.id, name: ch.name, slug: ch.slug, type: ch.type,
                    channelDescription: ch.description, topic: ch.topic, createdBy: ch.createdBy,
                    isArchived: ch.isArchived, readOnly: ch.readOnly, isPinned: ch.isPinned,
                    unreadCount: ch.unreadCount, lastMessageAt: Date.fromISO(ch.lastMessageAt),
                    dmUserID: ch.dmUserID, memberCount: ch.memberCount ?? 0,
                    createdAt: Date.fromISO(ch.createdAt) ?? .now, updatedAt: Date.fromISO(ch.updatedAt) ?? .now
                )
                context.insert(cached)
            }
        }

        for (id, cached) in existingByID where !remoteIDs.contains(id) {
            context.delete(cached)
        }

        try context.save()
    }

    private func updateChannel(_ cached: CachedChannel, from ch: ChannelResponse) {
        cached.name = ch.name
        cached.slug = ch.slug
        cached.type = ch.type
        cached.channelDescription = ch.description
        cached.topic = ch.topic
        cached.isArchived = ch.isArchived
        cached.readOnly = ch.readOnly
        cached.isPinned = ch.isPinned
        cached.unreadCount = ch.unreadCount
        cached.lastMessageAt = Date.fromISO(ch.lastMessageAt)
        cached.dmUserID = ch.dmUserID
        cached.memberCount = ch.memberCount ?? cached.memberCount
        cached.updatedAt = Date.fromISO(ch.updatedAt) ?? .now
    }

    /// Increment unread count for a channel (called when message arrives for non-active channel).
    func incrementUnread(channelID: String) throws {
        let context = modelContext
        let id = channelID
        let descriptor = FetchDescriptor<CachedChannel>(predicate: #Predicate { $0.id == id })
        guard let channel = try context.fetch(descriptor).first else { return }
        channel.unreadCount += 1
        channel.lastMessageAt = .now
        try context.save()
    }

    /// Reset unread count for a channel (called when user reads the channel).
    func resetUnread(channelID: String) throws {
        let context = modelContext
        let id = channelID
        let descriptor = FetchDescriptor<CachedChannel>(predicate: #Predicate { $0.id == id })
        guard let channel = try context.fetch(descriptor).first else { return }
        channel.unreadCount = 0
        try context.save()
    }

    // MARK: - Messages

    func syncMessages(channelID: String, _ messages: [MessageResponse]) throws {
        let context = modelContext
        for msg in messages {
            let msgID = msg.id
            let descriptor = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.id == msgID })
            let existing = try context.fetch(descriptor).first
            if let existing {
                updateMessage(existing, from: msg)
            } else {
                let cached = cachedMessage(from: msg)
                context.insert(cached)
            }
            try syncReactions(messageID: msg.id, msg.reactions)
        }
        try context.save()
    }

    func insertMessage(from payload: MessageNewPayload) throws {
        let context = modelContext
        let cached = CachedMessage(
            id: payload.id, channelID: payload.channelID, userID: payload.userID,
            threadID: payload.threadID, content: payload.content, contentType: payload.contentType,
            username: payload.username, displayName: payload.displayName, avatarURL: payload.avatarURL,
            isBot: payload.isBot, createdAt: Date.fromISO(payload.createdAt) ?? .now,
            fileID: payload.file?.id, fileName: payload.file?.filename,
            fileOriginalName: payload.file?.originalName, fileMimeType: payload.file?.mimeType,
            fileSizeBytes: payload.file?.sizeBytes, fileHasThumbnail: payload.file?.hasThumbnail
        )
        context.insert(cached)
        try context.save()
    }

    func editMessage(id: String, content: String, editedAt: String) throws {
        let context = modelContext
        let descriptor = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.id == id })
        guard let msg = try context.fetch(descriptor).first else { return }
        msg.content = content
        msg.editedAt = Date.fromISO(editedAt)
        try context.save()
    }

    func deleteMessage(id: String) throws {
        let context = modelContext
        let descriptor = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.id == id })
        guard let msg = try context.fetch(descriptor).first else { return }
        context.delete(msg)
        let reactionDescriptor = FetchDescriptor<CachedReaction>(predicate: #Predicate { $0.messageID == id })
        for reaction in try context.fetch(reactionDescriptor) { context.delete(reaction) }
        try context.save()
    }

    func pinMessage(id: String, pinned: Bool) throws {
        let context = modelContext
        let descriptor = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.id == id })
        guard let msg = try context.fetch(descriptor).first else { return }
        msg.isPinned = pinned
        try context.save()
    }

    /// Update thread summary on a parent message.
    func updateThreadSummary(messageID: String, replyCount: Int, lastReplyAt: String) throws {
        let context = modelContext
        let id = messageID
        let descriptor = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.id == id })
        guard let msg = try context.fetch(descriptor).first else { return }
        msg.threadReplyCount = replyCount
        msg.threadLastReplyAt = Date.fromISO(lastReplyAt)
        try context.save()
    }

    // MARK: - Reactions

    func syncReactions(messageID: String, _ reactions: [ReactionResponse]) throws {
        let context = modelContext
        let descriptor = FetchDescriptor<CachedReaction>(predicate: #Predicate { $0.messageID == messageID })
        for existing in try context.fetch(descriptor) { context.delete(existing) }
        for r in reactions {
            context.insert(CachedReaction(messageID: messageID, emoji: r.emoji, userID: r.userID, username: r.username))
        }
    }

    func addReaction(messageID: String, emoji: String, userID: String, username: String) throws {
        let context = modelContext
        context.insert(CachedReaction(messageID: messageID, emoji: emoji, userID: userID, username: username))
        try context.save()
    }

    func removeReaction(messageID: String, emoji: String, userID: String) throws {
        let context = modelContext
        let descriptor = FetchDescriptor<CachedReaction>(predicate: #Predicate {
            $0.messageID == messageID && $0.emoji == emoji && $0.userID == userID
        })
        for reaction in try context.fetch(descriptor) { context.delete(reaction) }
        try context.save()
    }

    // MARK: - Helpers

    private func cachedMessage(from msg: MessageResponse) -> CachedMessage {
        CachedMessage(
            id: msg.id, channelID: msg.channelID, userID: msg.userID, threadID: msg.threadID,
            content: msg.content, contentType: msg.contentType, username: msg.username,
            displayName: msg.displayName, avatarURL: msg.avatarURL, isBot: msg.isBot,
            isPinned: msg.isPinned, editedAt: Date.fromISO(msg.editedAt),
            createdAt: Date.fromISO(msg.createdAt) ?? .now,
            fileID: msg.file?.id, fileName: msg.file?.filename,
            fileOriginalName: msg.file?.originalName, fileMimeType: msg.file?.mimeType,
            fileSizeBytes: msg.file?.sizeBytes, fileHasThumbnail: msg.file?.hasThumbnail
        )
    }

    private func updateMessage(_ cached: CachedMessage, from msg: MessageResponse) {
        cached.content = msg.content
        cached.contentType = msg.contentType
        cached.isPinned = msg.isPinned
        cached.editedAt = Date.fromISO(msg.editedAt)
        cached.displayName = msg.displayName
        cached.avatarURL = msg.avatarURL
    }
}
