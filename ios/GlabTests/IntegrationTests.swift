import Testing
import Foundation
@testable import Glab

// MARK: - Mock API Client Tests

/// Tests that verify the full flow from APIClient through models.
@Suite("Integration - API Flow")
struct APIFlowTests {

    @Test("Login response decodes correctly")
    func loginResponseDecode() throws {
        let json = """
        {"token":"eyJ.test.token","user":{"id":"u1","username":"alice","email":"a@b.com","display_name":"Alice","role":"user","status":"online","is_bot":false,"auto_hide_days":0,"channel_sort":"activity","created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z"}}
        """
        let response = try JSONDecoder().decode(LoginResponse.self, from: json.data(using: .utf8)!)
        #expect(response.token == "eyJ.test.token")
        #expect(response.user.username == "alice")
        #expect(response.user.role == "user")
    }

    @Test("Channel list decode with all fields")
    func channelListDecode() throws {
        let json = """
        [{"id":"ch1","name":"general","slug":"general","type":"public","created_by":"u1","is_archived":false,"read_only":false,"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z","unread_count":5,"is_pinned":false,"member_count":42},
         {"id":"ch2","name":"DM","slug":"dm","type":"dm","created_by":"u1","is_archived":false,"read_only":false,"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z","unread_count":0,"is_pinned":true,"dm_user_id":"u2"}]
        """
        let channels = try JSONDecoder().decode([ChannelResponse].self, from: json.data(using: .utf8)!)
        #expect(channels.count == 2)
        #expect(channels[0].isPublic)
        #expect(channels[0].unreadCount == 5)
        #expect(channels[1].isDM)
        #expect(channels[1].isPinned)
        #expect(channels[1].dmUserID == "u2")
    }

    @Test("Message with file attachment")
    func messageWithFile() throws {
        let json = """
        {"id":"m1","channel_id":"ch1","user_id":"u1","content":"","content_type":"file","is_pinned":false,"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z","username":"alice","display_name":"Alice","is_bot":false,"reactions":[],"file":{"id":"f1","user_id":"u1","channel_id":"ch1","filename":"photo.jpg","original_name":"vacation.jpg","mime_type":"image/jpeg","size_bytes":1048576,"has_thumbnail":true,"created_at":"2024-01-01T00:00:00Z"}}
        """
        let msg = try JSONDecoder().decode(MessageResponse.self, from: json.data(using: .utf8)!)
        #expect(msg.isFile)
        #expect(msg.file?.isImage == true)
        #expect(msg.file?.sizeBytes == 1048576)
        #expect(msg.file?.hasThumbnail == true)
    }

    @Test("Agent session list decode")
    func agentSessionDecode() throws {
        let json = """
        [{"id":"s1","agent_id":"a1","user_id":"u1","title":"Help with code","is_active":true,"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z","last_agent_message":"Here's how you can..."}]
        """
        let sessions = try JSONDecoder().decode([AgentSessionResponse].self, from: json.data(using: .utf8)!)
        #expect(sessions.count == 1)
        #expect(sessions[0].title == "Help with code")
        #expect(sessions[0].isActive)
        #expect(sessions[0].lastAgentMessage == "Here's how you can...")
    }
}

// MARK: - WebSocket Event Flow Tests

@Suite("Integration - WS Event Flow")
struct WSEventFlowTests {

    @Test("message.new payload round-trip")
    func messageNewRoundTrip() throws {
        let json = """
        {"type":"message.new","payload":{"id":"m1","channel_id":"ch1","user_id":"u1","username":"alice","display_name":"Alice","content":"Hello!","content_type":"text","is_bot":false,"created_at":"2024-01-01T00:00:00Z"}}
        """
        let envelope = try JSONDecoder().decode(WebSocketEnvelope.self, from: json.data(using: .utf8)!)
        #expect(envelope.type == WSEvent.messageNew)
        let payload = envelope.decodePayload(MessageNewPayload.self)
        #expect(payload?.id == "m1")
        #expect(payload?.content == "Hello!")
        #expect(payload?.channelID == "ch1")
    }

    @Test("reaction.updated payload")
    func reactionUpdated() throws {
        let json = """
        {"type":"reaction.updated","payload":{"message_id":"m1","channel_id":"ch1","emoji":"👍","user_id":"u2","username":"bob","action":"add"}}
        """
        let envelope = try JSONDecoder().decode(WebSocketEnvelope.self, from: json.data(using: .utf8)!)
        let payload = envelope.decodePayload(ReactionUpdatedPayload.self)
        #expect(payload?.emoji == "👍")
        #expect(payload?.action == "add")
    }

    @Test("thread.updated payload")
    func threadUpdated() throws {
        let json = """
        {"type":"thread.updated","payload":{"message_id":"m1","channel_id":"ch1","reply_count":5,"last_reply_at":"2024-01-15T10:00:00Z"}}
        """
        let envelope = try JSONDecoder().decode(WebSocketEnvelope.self, from: json.data(using: .utf8)!)
        let payload = envelope.decodePayload(ThreadUpdatedPayload.self)
        #expect(payload?.replyCount == 5)
    }

    @Test("presence broadcast")
    func presenceBroadcast() throws {
        let json = """
        {"type":"presence","payload":{"user_id":"u1","username":"alice","status":"online"}}
        """
        let envelope = try JSONDecoder().decode(WebSocketEnvelope.self, from: json.data(using: .utf8)!)
        let payload = envelope.decodePayload(PresenceBroadcastPayload.self)
        #expect(payload?.status == "online")
    }

    @Test("typing broadcast")
    func typingBroadcast() throws {
        let json = """
        {"type":"typing","payload":{"channel_id":"ch1","user_id":"u1","username":"alice","display_name":"Alice","is_typing":true}}
        """
        let envelope = try JSONDecoder().decode(WebSocketEnvelope.self, from: json.data(using: .utf8)!)
        let payload = envelope.decodePayload(TypingBroadcastPayload.self)
        #expect(payload?.isTyping == true)
        #expect(payload?.displayName == "Alice")
    }

    @Test("ai.panel.chunk streaming")
    func aiPanelChunk() throws {
        let json = """
        {"type":"ai.panel.chunk","payload":{"agent_slug":"helper","session_id":"s1","content":"Here is","done":false}}
        """
        let envelope = try JSONDecoder().decode(WebSocketEnvelope.self, from: json.data(using: .utf8)!)
        let payload = envelope.decodePayload(AIPanelChunkPayload.self)
        #expect(payload?.content == "Here is")
        #expect(payload?.done == false)
    }

    @Test("ai.panel.chunk done with message_id")
    func aiPanelChunkDone() throws {
        let json = """
        {"type":"ai.panel.chunk","payload":{"agent_slug":"helper","session_id":"s1","content":"","done":true,"message_id":"m99"}}
        """
        let envelope = try JSONDecoder().decode(WebSocketEnvelope.self, from: json.data(using: .utf8)!)
        let payload = envelope.decodePayload(AIPanelChunkPayload.self)
        #expect(payload?.done == true)
        #expect(payload?.messageID == "m99")
    }
}

// MARK: - Offline Queue Tests

@Suite("Integration - Offline Queue")
struct OfflineQueueTests {

    @MainActor
    @Test("Queue message when offline")
    func queueMessage() {
        let queue = OfflineQueue()
        queue.enqueue(channelID: "ch1", content: "Hello offline")
        #expect(queue.hasPending)
        #expect(queue.pendingMessages.count == 1)
        #expect(queue.pendingMessages[0].content == "Hello offline")
    }

    @MainActor
    @Test("Clear queue")
    func clearQueue() {
        let queue = OfflineQueue()
        queue.enqueue(channelID: "ch1", content: "msg1")
        queue.enqueue(channelID: "ch1", content: "msg2")
        #expect(queue.pendingMessages.count == 2)
        queue.clear()
        #expect(!queue.hasPending)
    }
}

// MARK: - Presence Service Tests

@Suite("Integration - Presence")
struct PresenceServiceTests {

    @MainActor
    @Test("Update and query presence")
    func updateAndQuery() {
        let service = PresenceService()
        service.update(userID: "u1", status: "online")
        service.update(userID: "u2", status: "away")
        #expect(service.status(for: "u1") == "online")
        #expect(service.status(for: "u2") == "away")
        #expect(service.status(for: "u3") == "offline")
        #expect(service.isOnline("u1"))
        #expect(service.isOnline("u2"))
        #expect(!service.isOnline("u3"))
    }

    @MainActor
    @Test("Clear resets all")
    func clearResets() {
        let service = PresenceService()
        service.update(userID: "u1", status: "online")
        service.clear()
        #expect(service.status(for: "u1") == "offline")
    }
}

// MARK: - Error Handling Tests

@Suite("Integration - API Error")
struct APIErrorTests {

    @Test("Decode backend error response")
    func decodeError() throws {
        let json = """
        {"error":"channel not found"}
        """
        let err = try JSONDecoder().decode(APIErrorResponse.self, from: json.data(using: .utf8)!)
        #expect(err.error == "channel not found")
    }

    @Test("API error descriptions")
    func errorDescriptions() {
        #expect(APIError.unauthorized.errorDescription?.contains("expired") == true)
        #expect(APIError.notFound.errorDescription?.contains("not found") == true)
        #expect(APIError.notConfigured.errorDescription?.contains("not configured") == true)
    }
}
