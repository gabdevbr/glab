import Foundation
import SwiftData

@MainActor
@Observable
final class ThreadViewModel {
    let parentMessageID: String
    let channelID: String
    var isLoading = false
    var isSending = false
    var messageText = ""
    var errorMessage: String?

    private let messageService: MessageService
    private let syncEngine: SyncEngine
    private let webSocketClient: WebSocketClient

    init(parentMessageID: String, channelID: String, apiClient: APIClient, syncEngine: SyncEngine, webSocketClient: WebSocketClient) {
        self.parentMessageID = parentMessageID
        self.channelID = channelID
        self.messageService = MessageService(apiClient: apiClient)
        self.syncEngine = syncEngine
        self.webSocketClient = webSocketClient
    }

    func loadReplies() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let replies = try await messageService.threadMessages(messageID: parentMessageID)
            try await syncEngine.syncMessages(channelID: channelID, replies)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendReply() async {
        let content = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        isSending = true
        messageText = ""

        do {
            let payload = MessageSendPayload(channelID: channelID, content: content, threadID: parentMessageID)
            _ = try await webSocketClient.sendAndAwaitAck(WSEvent.messageSend, payload: payload)
        } catch {
            messageText = content
            errorMessage = error.localizedDescription
        }

        isSending = false
    }
}
