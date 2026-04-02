import Foundation

/// Handles AI agent operations.
struct AgentService {
    let apiClient: APIClient

    func listAgents() async throws -> [AgentResponse] {
        try await apiClient.request(.listAgents)
    }

    func getAgent(slug: String) async throws -> AgentResponse {
        try await apiClient.request(.getAgent(slug: slug))
    }

    func listSessions(agentSlug: String) async throws -> [AgentSessionResponse] {
        try await apiClient.request(.agentSessions(slug: agentSlug))
    }

    func sessionMessages(agentSlug: String, sessionID: String) async throws -> [MessageResponse] {
        try await apiClient.request(.agentSessionMessages(slug: agentSlug, sessionID: sessionID))
    }
}
