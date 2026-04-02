import Foundation

/// Queues messages for retry when the WebSocket is disconnected.
/// Messages are stored in memory and retried when the connection is restored.
@MainActor
@Observable
final class OfflineQueue {
    struct PendingMessage: Identifiable {
        let id = UUID()
        let channelID: String
        let content: String
        let threadID: String?
        let createdAt = Date()
    }

    private(set) var pendingMessages: [PendingMessage] = []
    var hasPending: Bool { !pendingMessages.isEmpty }

    func enqueue(channelID: String, content: String, threadID: String? = nil) {
        pendingMessages.append(PendingMessage(channelID: channelID, content: content, threadID: threadID))
    }

    /// Flush all pending messages through the WebSocket. Returns failures.
    func flush(via webSocketClient: WebSocketClient) async -> [PendingMessage] {
        guard !pendingMessages.isEmpty else { return [] }
        guard webSocketClient.state == .connected else { return pendingMessages }

        var failures: [PendingMessage] = []
        let messages = pendingMessages
        pendingMessages.removeAll()

        for msg in messages {
            do {
                let payload = MessageSendPayload(channelID: msg.channelID, content: msg.content, threadID: msg.threadID)
                _ = try await webSocketClient.sendAndAwaitAck(WSEvent.messageSend, payload: payload)
            } catch {
                failures.append(msg)
            }
        }

        // Put failures back
        pendingMessages.append(contentsOf: failures)
        return failures
    }

    func clear() {
        pendingMessages.removeAll()
    }
}
