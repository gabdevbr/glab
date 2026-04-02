import Foundation
import SwiftData

/// Listens to WebSocket events and dispatches them to the appropriate services.
@MainActor
final class EventRouter {
    private let webSocketClient: WebSocketClient
    private let presenceService: PresenceService
    private let typingService: TypingService
    private let syncEngine: SyncEngine
    private var task: Task<Void, Never>?

    /// Called when a new message arrives (channelID for routing).
    var onNewMessage: ((MessageNewPayload) -> Void)?
    var onNotification: ((NotificationPayload) -> Void)?
    var onAIChunk: ((AIChunkPayload) -> Void)?
    var onAIPanelChunk: ((AIPanelChunkPayload) -> Void)?

    /// The currently active channel — messages for other channels increment unread.
    var activeChannelID: String?

    init(
        webSocketClient: WebSocketClient,
        presenceService: PresenceService,
        typingService: TypingService,
        syncEngine: SyncEngine
    ) {
        self.webSocketClient = webSocketClient
        self.presenceService = presenceService
        self.typingService = typingService
        self.syncEngine = syncEngine
    }

    func start() {
        task?.cancel()
        task = Task { [weak self] in
            guard let self else { return }
            for await envelope in self.webSocketClient.events {
                await self.handle(envelope)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func handle(_ envelope: WebSocketEnvelope) async {
        switch envelope.type {
        case WSEvent.messageNew:
            guard let payload = envelope.decodePayload(MessageNewPayload.self) else { return }
            try? await syncEngine.insertMessage(from: payload)
            // Increment unread for non-active channels
            if payload.channelID != activeChannelID {
                try? await syncEngine.incrementUnread(channelID: payload.channelID)
            }
            onNewMessage?(payload)

        case WSEvent.messageEdited:
            guard let payload = envelope.decodePayload(MessageEditedPayload.self) else { return }
            try? await syncEngine.editMessage(id: payload.id, content: payload.content, editedAt: payload.editedAt)

        case WSEvent.messageDeleted:
            guard let payload = envelope.decodePayload(MessageDeletedPayload.self) else { return }
            try? await syncEngine.deleteMessage(id: payload.id)

        case WSEvent.messagePinned:
            guard let payload = envelope.decodePayload(PinPayload.self) else { return }
            try? await syncEngine.pinMessage(id: payload.messageID, pinned: true)

        case WSEvent.messageUnpinned:
            guard let payload = envelope.decodePayload(PinPayload.self) else { return }
            try? await syncEngine.pinMessage(id: payload.messageID, pinned: false)

        case WSEvent.reactionUpdated:
            guard let payload = envelope.decodePayload(ReactionUpdatedPayload.self) else { return }
            if payload.action == "add" {
                try? await syncEngine.addReaction(messageID: payload.messageID, emoji: payload.emoji, userID: payload.userID, username: payload.username)
            } else {
                try? await syncEngine.removeReaction(messageID: payload.messageID, emoji: payload.emoji, userID: payload.userID)
            }

        case WSEvent.threadUpdated:
            guard let payload = envelope.decodePayload(ThreadUpdatedPayload.self) else { return }
            try? await syncEngine.updateThreadSummary(messageID: payload.messageID, replyCount: payload.replyCount, lastReplyAt: payload.lastReplyAt)

        case WSEvent.typing:
            guard let payload = envelope.decodePayload(TypingBroadcastPayload.self) else { return }
            typingService.handleTypingEvent(payload)

        case WSEvent.presence:
            guard let payload = envelope.decodePayload(PresenceBroadcastPayload.self) else { return }
            presenceService.update(userID: payload.userID, status: payload.status)

        case WSEvent.notification:
            guard let payload = envelope.decodePayload(NotificationPayload.self) else { return }
            onNotification?(payload)

        case WSEvent.aiChunk:
            guard let payload = envelope.decodePayload(AIChunkPayload.self) else { return }
            onAIChunk?(payload)

        case WSEvent.aiPanelChunk:
            guard let payload = envelope.decodePayload(AIPanelChunkPayload.self) else { return }
            onAIPanelChunk?(payload)

        default:
            break
        }
    }
}
