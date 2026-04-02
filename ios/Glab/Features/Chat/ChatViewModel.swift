import Foundation
import SwiftData

@MainActor
@Observable
final class ChatViewModel {
    var channelID: String
    var isLoading = false
    var isSending = false
    var hasMoreMessages = true
    var isLoadingMore = false
    var messageText = ""
    var errorMessage: String?

    private let messageService: MessageService
    private let syncEngine: SyncEngine
    private let webSocketClient: WebSocketClient
    private var offlineQueue: OfflineQueue?

    // Typing rate limiter — max once per 3 seconds
    private var lastTypingSent: Date = .distantPast

    init(channelID: String, apiClient: APIClient, syncEngine: SyncEngine, webSocketClient: WebSocketClient, offlineQueue: OfflineQueue? = nil) {
        self.channelID = channelID
        self.messageService = MessageService(apiClient: apiClient)
        self.syncEngine = syncEngine
        self.webSocketClient = webSocketClient
        self.offlineQueue = offlineQueue
    }

    func loadMessages() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let messages = try await messageService.listMessages(channelID: channelID)
            try await syncEngine.syncMessages(channelID: channelID, messages)
            hasMoreMessages = messages.count >= 50
        } catch {
            errorMessage = "Failed to load messages: \(error.localizedDescription)"
        }
    }

    func loadMoreMessages(beforeID: String) async {
        guard hasMoreMessages, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let messages = try await messageService.listMessages(channelID: channelID, before: beforeID)
            try await syncEngine.syncMessages(channelID: channelID, messages)
            hasMoreMessages = messages.count >= 50
        } catch {
            errorMessage = "Failed to load more messages"
        }
    }

    func sendMessage() async {
        let content = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        isSending = true
        messageText = ""

        if webSocketClient.state == .connected {
            do {
                let payload = MessageSendPayload(channelID: channelID, content: content, threadID: nil)
                let ack = try await webSocketClient.sendAndAwaitAck(WSEvent.messageSend, payload: payload)
                if !ack.ok {
                    errorMessage = ack.error ?? "Failed to send message"
                    messageText = content
                }
            } catch {
                // Queue for retry
                offlineQueue?.enqueue(channelID: channelID, content: content)
                errorMessage = "Message queued — will send when back online"
            }
        } else {
            // Offline — queue
            offlineQueue?.enqueue(channelID: channelID, content: content)
            errorMessage = "Offline — message queued"
        }

        isSending = false
    }

    func markAsRead(lastMessageID: String) async {
        guard webSocketClient.state == .connected else { return }
        let payload = ChannelReadPayload(channelID: channelID, messageID: lastMessageID)
        try? await webSocketClient.send(WSEvent.channelRead, payload: payload)
    }

    /// Rate-limited typing indicator — max once per 3 seconds.
    func sendTypingStart() async {
        let now = Date()
        guard now.timeIntervalSince(lastTypingSent) >= 3.0 else { return }
        lastTypingSent = now
        guard webSocketClient.state == .connected else { return }
        let payload = TypingPayload(channelID: channelID)
        try? await webSocketClient.send(WSEvent.typingStart, payload: payload)
    }

    func sendTypingStop() async {
        guard webSocketClient.state == .connected else { return }
        let payload = TypingPayload(channelID: channelID)
        try? await webSocketClient.send(WSEvent.typingStop, payload: payload)
    }

    func deleteMessage(id: String) async {
        guard webSocketClient.state == .connected else {
            errorMessage = "Cannot delete while offline"
            return
        }
        let payload = MessageDeletePayload(messageID: id)
        try? await webSocketClient.send(WSEvent.messageDelete, payload: payload)
    }

    func editMessage(id: String, content: String) async {
        guard webSocketClient.state == .connected else {
            errorMessage = "Cannot edit while offline"
            return
        }
        let payload = MessageEditPayload(messageID: id, content: content)
        try? await webSocketClient.send(WSEvent.messageEdit, payload: payload)
    }

    func pinMessage(id: String) async {
        let payload = PinPayload(messageID: id)
        try? await webSocketClient.send(WSEvent.messagePin, payload: payload)
    }

    func unpinMessage(id: String) async {
        let payload = PinPayload(messageID: id)
        try? await webSocketClient.send(WSEvent.messageUnpin, payload: payload)
    }

    func addReaction(messageID: String, emoji: String) async {
        let payload = ReactionPayload(messageID: messageID, emoji: emoji)
        try? await webSocketClient.send(WSEvent.reactionAdd, payload: payload)
    }

    func removeReaction(messageID: String, emoji: String) async {
        let payload = ReactionPayload(messageID: messageID, emoji: emoji)
        try? await webSocketClient.send(WSEvent.reactionRemove, payload: payload)
    }

    func sendGif(_ gifURL: String) async {
        let payload = MessageSendPayload(channelID: channelID, content: gifURL, threadID: nil)
        _ = try? await webSocketClient.sendAndAwaitAck(WSEvent.messageSend, payload: payload)
    }
}
