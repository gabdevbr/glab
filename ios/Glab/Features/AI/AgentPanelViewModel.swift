import Foundation

@MainActor
@Observable
final class AgentPanelViewModel {
    let agent: AgentResponse
    var sessions: [AgentSessionResponse] = []
    var currentSessionID: String?
    var messages: [MessageResponse] = []
    var streamingContent = ""
    var isStreaming = false
    var promptText = ""
    var isLoading = false

    private let agentService: AgentService
    private let webSocketClient: WebSocketClient

    init(agent: AgentResponse, apiClient: APIClient, webSocketClient: WebSocketClient) {
        self.agent = agent
        self.agentService = AgentService(apiClient: apiClient)
        self.webSocketClient = webSocketClient
    }

    func loadSessions() async {
        isLoading = true
        defer { isLoading = false }
        sessions = (try? await agentService.listSessions(agentSlug: agent.slug)) ?? []
    }

    func selectSession(_ session: AgentSessionResponse) async {
        currentSessionID = session.id
        messages = (try? await agentService.sessionMessages(agentSlug: agent.slug, sessionID: session.id)) ?? []
    }

    func startNewSession() {
        currentSessionID = nil
        messages = []
        streamingContent = ""
    }

    func sendPrompt() async {
        let content = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        promptText = ""
        isStreaming = true
        streamingContent = ""

        let payload = AIPromptPayload(agentSlug: agent.slug, sessionID: currentSessionID, content: content)
        try? await webSocketClient.send(WSEvent.aiPrompt, payload: payload)
    }

    func stopStreaming() async {
        let payload = AIStopPayload(agentSlug: agent.slug, channelID: nil)
        try? await webSocketClient.send(WSEvent.aiStop, payload: payload)
        isStreaming = false
    }

    /// Called by EventRouter when ai.panel.chunk arrives.
    func handlePanelChunk(_ chunk: AIPanelChunkPayload) {
        guard chunk.agentSlug == agent.slug else { return }

        streamingContent += chunk.content

        if chunk.done {
            isStreaming = false
            if let sessionID = chunk.sessionID as String? {
                currentSessionID = sessionID
            }
            // Reload messages to get the final saved version
            if let sessionID = currentSessionID {
                Task {
                    messages = (try? await agentService.sessionMessages(agentSlug: agent.slug, sessionID: sessionID)) ?? []
                    streamingContent = ""
                }
            }
        }
    }
}
