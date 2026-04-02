import SwiftUI

struct AgentListView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var agents: [AgentResponse] = []
    @State private var isLoading = true
    @State private var selectedAgent: AgentResponse?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading agents...")
                } else if agents.isEmpty {
                    ContentUnavailableView("No Agents", systemImage: "cpu", description: Text("No AI agents are configured yet."))
                } else {
                    List(agents) { agent in
                        Button {
                            selectedAgent = agent
                        } label: {
                            HStack(spacing: 12) {
                                Text(agent.emoji)
                                    .font(.title2)
                                    .frame(width: 40, height: 40)
                                    .background(Circle().fill(.secondary.opacity(0.1)))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(agent.name)
                                        .font(.body.weight(.medium))
                                    if let desc = agent.description, !desc.isEmpty {
                                        Text(desc)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                }

                                Spacer()

                                Text(agent.category)
                                    .font(.caption2)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(.secondary.opacity(0.1)))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("AI Agents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .sheet(item: $selectedAgent) { agent in
                AgentPanelView(agent: agent)
                    .environment(appState)
            }
            .task {
                isLoading = true
                agents = (try? await appState.apiClient.request(.listAgents) as [AgentResponse]) ?? []
                isLoading = false
            }
        }
    }
}

