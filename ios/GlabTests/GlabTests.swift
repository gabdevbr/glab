import Testing
import Foundation
@testable import Glab

// MARK: - Date Extension Tests

@Suite("Date+Formatting")
struct DateFormattingTests {

    @Test("Parse valid ISO 8601 string")
    func parseValidISO() {
        let date = Date.fromISO("2024-01-15T10:30:00Z")
        #expect(date != nil)
    }

    @Test("Parse nil returns nil")
    func parseNil() {
        #expect(Date.fromISO(nil) == nil)
    }

    @Test("Parse empty string returns nil")
    func parseEmpty() {
        #expect(Date.fromISO("") == nil)
    }

    @Test("Parse invalid string returns nil")
    func parseInvalid() {
        #expect(Date.fromISO("not-a-date") == nil)
    }

    @Test("Short time format")
    func shortTime() {
        let date = Date.fromISO("2024-01-15T14:30:00Z")!
        let result = date.shortTime
        #expect(!result.isEmpty)
    }

    @Test("Relative day for today")
    func relativeDayToday() {
        let result = Date.now.relativeDay
        #expect(result == "Today")
    }
}

// MARK: - Token Manager Tests

@Suite("TokenManager")
struct TokenManagerTests {

    @Test("Token is nil by default after clear")
    func tokenNilAfterClear() {
        let manager = TokenManager()
        manager.clear()
        #expect(manager.token == nil)
    }

    @Test("Token round-trip — verifies code doesn't crash (Keychain may not persist in test sandbox)")
    func tokenRoundTrip() {
        // Keychain silently fails in xctest sandbox without host app entitlements.
        // This test verifies the code path doesn't crash, not that Keychain persists.
        let manager = TokenManager()
        let testToken = "eyJ.test.fake"
        manager.token = testToken
        // Don't assert value — Keychain may not work in sandbox
        manager.clear()
        #expect(manager.token == nil)
    }

    @Test("Expired token is not valid")
    func expiredTokenNotValid() {
        let manager = TokenManager()
        // Token with exp in the past
        let expiredToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzIiwiZXhwIjoxNjAwMDAwMDAwfQ.fake"
        manager.token = expiredToken
        #expect(!manager.isTokenValid)
        manager.clear()
    }
}

// MARK: - WebSocket Envelope Tests

@Suite("WebSocketEnvelope")
struct WebSocketEnvelopeTests {

    @Test("Create envelope with typed payload")
    func createEnvelope() {
        let payload = MessageSendPayload(channelID: "chan-1", content: "Hello", threadID: nil)
        let envelope = WebSocketEnvelope.make(type: WSEvent.messageSend, id: "1", payload: payload)
        #expect(envelope != nil)
        #expect(envelope?.type == "message.send")
        #expect(envelope?.id == "1")
    }

    @Test("Decode payload from envelope")
    func decodePayload() {
        // Use PresenceUpdatePayload which is Encodable, and decode as a dict
        let payload = ChannelReadPayload(channelID: "chan-1", messageID: "msg-1")
        let envelope = WebSocketEnvelope.make(type: WSEvent.channelRead, payload: payload)!
        let decoded = envelope.decodePayload(ChannelReadPayload.self)
        #expect(decoded?.channelID == "chan-1")
        #expect(decoded?.messageID == "msg-1")
    }

    @Test("Decode Decodable payload")
    func decodeDecodablePayload() {
        let payload = PinPayload(messageID: "msg-parent")
        let envelope = WebSocketEnvelope.make(type: WSEvent.messagePin, payload: payload)!
        let decoded = envelope.decodePayload(PinPayload.self)
        #expect(decoded?.messageID == "msg-parent")
    }

    @Test("Nil payload decodes as nil")
    func nilPayload() {
        let envelope = WebSocketEnvelope(type: WSEvent.hello)
        let decoded = envelope.decodePayload(HelloPayload.self)
        #expect(decoded == nil)
    }
}

// MARK: - API Endpoint Tests

@Suite("APIEndpoint")
struct APIEndpointTests {

    @Test("Login endpoint")
    func loginEndpoint() {
        let endpoint = APIEndpoint.login(username: "user", password: "pass")
        #expect(endpoint.method == "POST")
        #expect(endpoint.path == "/api/v1/auth/login")
        #expect(endpoint.requiresAuth == false)
        #expect(endpoint.body != nil)
    }

    @Test("List channels endpoint")
    func listChannels() {
        let endpoint = APIEndpoint.listChannels
        #expect(endpoint.method == "GET")
        #expect(endpoint.path == "/api/v1/channels")
        #expect(endpoint.requiresAuth == true)
        #expect(endpoint.body == nil)
    }

    @Test("List messages with pagination")
    func listMessages() {
        let endpoint = APIEndpoint.listMessages(channelID: "abc", limit: 25, before: "msg-100")
        #expect(endpoint.path == "/api/v1/channels/abc/messages")
        let items = endpoint.queryItems!
        #expect(items.contains { $0.name == "limit" && $0.value == "25" })
        #expect(items.contains { $0.name == "before" && $0.value == "msg-100" })
    }

    @Test("Search endpoint with query params")
    func searchEndpoint() {
        let endpoint = APIEndpoint.search(query: "hello", channelID: "ch-1", limit: 10)
        #expect(endpoint.path == "/api/v1/search")
        let items = endpoint.queryItems!
        #expect(items.contains { $0.name == "q" && $0.value == "hello" })
        #expect(items.contains { $0.name == "channel_id" && $0.value == "ch-1" })
    }

    @Test("Create channel body")
    func createChannel() {
        let endpoint = APIEndpoint.createChannel(body: ["name": "general", "type": "public"])
        #expect(endpoint.method == "POST")
        #expect(endpoint.path == "/api/v1/channels")
        #expect(endpoint.body != nil)
    }

    @Test("Hide channel body")
    func hideChannel() {
        let endpoint = APIEndpoint.hideChannel(id: "ch-1", hidden: true)
        #expect(endpoint.method == "PATCH")
        #expect(endpoint.path == "/api/v1/channels/ch-1/hide")
        let bodyJSON = try? JSONSerialization.jsonObject(with: endpoint.body!) as? [String: Any]
        #expect(bodyJSON?["hidden"] as? Bool == true)
    }

    @Test("Admin endpoints require auth")
    func adminAuth() {
        let endpoint = APIEndpoint.adminStats
        #expect(endpoint.requiresAuth == true)
        #expect(endpoint.method == "GET")
    }

    @Test("Delete channel method")
    func deleteChannel() {
        let endpoint = APIEndpoint.deleteChannel(id: "ch-1")
        #expect(endpoint.method == "DELETE")
    }

    @Test("Upload file endpoint")
    func uploadFile() {
        let endpoint = APIEndpoint.uploadFile(channelID: "ch-1")
        #expect(endpoint.method == "POST")
        #expect(endpoint.path == "/api/v1/channels/ch-1/upload")
    }

    @Test("Agent session messages path")
    func agentSessionMessages() {
        let endpoint = APIEndpoint.agentSessionMessages(slug: "helper", sessionID: "sess-1")
        #expect(endpoint.path == "/api/v1/agents/helper/sessions/sess-1/messages")
    }
}

// MARK: - API Models Decoding Tests

@Suite("APIModels Decoding")
struct APIModelsDecodingTests {

    @Test("Decode UserResponse")
    func decodeUser() throws {
        let json = """
        {"id":"u1","username":"alice","email":"a@b.com","display_name":"Alice","role":"user","status":"online","is_bot":false,"auto_hide_days":0,"channel_sort":"activity","created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z"}
        """
        let user = try JSONDecoder().decode(UserResponse.self, from: json.data(using: .utf8)!)
        #expect(user.id == "u1")
        #expect(user.username == "alice")
        #expect(user.displayName == "Alice")
        #expect(user.isBot == false)
        #expect(user.autoHideDays == 0)
    }

    @Test("Decode ChannelResponse")
    func decodeChannel() throws {
        let json = """
        {"id":"ch1","name":"general","slug":"general","type":"public","created_by":"u1","is_archived":false,"read_only":false,"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z","unread_count":3,"is_pinned":true}
        """
        let ch = try JSONDecoder().decode(ChannelResponse.self, from: json.data(using: .utf8)!)
        #expect(ch.id == "ch1")
        #expect(ch.name == "general")
        #expect(ch.isPublic)
        #expect(ch.unreadCount == 3)
        #expect(ch.isPinned)
    }

    @Test("Decode MessageResponse with reactions")
    func decodeMessage() throws {
        let json = """
        {"id":"m1","channel_id":"ch1","user_id":"u1","content":"hello","content_type":"text","is_pinned":false,"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z","username":"alice","display_name":"Alice","is_bot":false,"reactions":[{"emoji":"👍","user_id":"u2","username":"bob"}]}
        """
        let msg = try JSONDecoder().decode(MessageResponse.self, from: json.data(using: .utf8)!)
        #expect(msg.id == "m1")
        #expect(msg.content == "hello")
        #expect(msg.reactions.count == 1)
        #expect(msg.reactions[0].emoji == "👍")
    }

    @Test("Decode FileResponse")
    func decodeFile() throws {
        let json = """
        {"id":"f1","user_id":"u1","channel_id":"ch1","filename":"img.png","original_name":"photo.png","mime_type":"image/png","size_bytes":12345,"has_thumbnail":true,"created_at":"2024-01-01T00:00:00Z"}
        """
        let file = try JSONDecoder().decode(FileResponse.self, from: json.data(using: .utf8)!)
        #expect(file.isImage)
        #expect(file.hasThumbnail)
        #expect(file.sizeBytes == 12345)
    }

    @Test("Decode SearchResultResponse")
    func decodeSearchResult() throws {
        let json = """
        {"id":"m1","channel_id":"ch1","user_id":"u1","content":"found","content_type":"text","created_at":"2024-01-01T00:00:00Z","username":"alice","display_name":"Alice","is_bot":false,"rank":0.95}
        """
        let result = try JSONDecoder().decode(SearchResultResponse.self, from: json.data(using: .utf8)!)
        #expect(result.rank > 0.9)
    }
}

// MARK: - WS Event Constants Tests

@Suite("WSEvent Constants")
struct WSEventTests {

    @Test("All client events defined")
    func clientEvents() {
        #expect(WSEvent.messageSend == "message.send")
        #expect(WSEvent.messageEdit == "message.edit")
        #expect(WSEvent.messageDelete == "message.delete")
        #expect(WSEvent.reactionAdd == "reaction.add")
        #expect(WSEvent.typingStart == "typing.start")
        #expect(WSEvent.presenceUpdate == "presence.update")
        #expect(WSEvent.channelRead == "channel.read")
        #expect(WSEvent.aiPrompt == "ai.prompt")
        #expect(WSEvent.aiStop == "ai.stop")
    }

    @Test("All server events defined")
    func serverEvents() {
        #expect(WSEvent.ack == "ack")
        #expect(WSEvent.hello == "hello")
        #expect(WSEvent.messageNew == "message.new")
        #expect(WSEvent.messageEdited == "message.edited")
        #expect(WSEvent.reactionUpdated == "reaction.updated")
        #expect(WSEvent.threadUpdated == "thread.updated")
        #expect(WSEvent.typing == "typing")
        #expect(WSEvent.presence == "presence")
        #expect(WSEvent.aiChunk == "ai.chunk")
        #expect(WSEvent.aiPanelChunk == "ai.panel.chunk")
    }
}

// MARK: - Server Environment Tests

@Suite("ServerEnvironment", .serialized)
struct ServerEnvironmentTests {

    @Test("WebSocket URL conversion http to ws")
    func wsURLConversion() {
        let saved = ServerEnvironment.serverURL
        defer { ServerEnvironment.serverURL = saved }

        ServerEnvironment.serverURL = URL(string: "http://localhost:8080")
        let wsURL = ServerEnvironment.webSocketURL
        #expect(wsURL?.scheme == "ws")
        #expect(wsURL?.path == "/ws")
    }

    @Test("WebSocket URL conversion https to wss")
    func wssURLConversion() {
        let saved = ServerEnvironment.serverURL
        defer { ServerEnvironment.serverURL = saved }

        let httpsURL = URL(string: "https://chat.example.com")!
        ServerEnvironment.serverURL = httpsURL
        #expect(ServerEnvironment.serverURL?.scheme == "https")
        let wsURL = ServerEnvironment.webSocketURL
        #expect(wsURL?.scheme == "wss")
        #expect(wsURL?.path == "/ws")
    }

    @Test("API URL construction")
    func apiURL() {
        let saved = ServerEnvironment.serverURL
        defer { ServerEnvironment.serverURL = saved }

        ServerEnvironment.serverURL = URL(string: "http://localhost:8080")
        let url = ServerEnvironment.apiURL(path: "/api/v1/channels")
        #expect(url?.absoluteString.contains("/api/v1/channels") == true)
    }
}
