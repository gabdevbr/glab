import SwiftUI

struct AgentPanelView: View {
    let agent: AgentResponse

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: AgentPanelViewModel?
    @State private var showSessions = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let viewModel {
                    chatContent(viewModel)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("\(agent.emoji) \(agent.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { viewModel?.startNewSession() } label: {
                            Label("New Session", systemImage: "plus")
                        }
                        Button { showSessions = true } label: {
                            Label("Sessions", systemImage: "clock.arrow.circlepath")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showSessions) {
                if let viewModel {
                    sessionListSheet(viewModel)
                }
            }
            .task {
                if viewModel == nil {
                    let vm = AgentPanelViewModel(
                        agent: agent,
                        apiClient: appState.apiClient,
                        webSocketClient: appState.webSocketClient
                    )
                    viewModel = vm

                    // Wire up AI panel chunks
                    appState.eventRouter?.onAIPanelChunk = { [weak vm] chunk in
                        vm?.handlePanelChunk(chunk)
                    }

                    await vm.loadSessions()
                    if let first = vm.sessions.first {
                        await vm.selectSession(first)
                    }
                }
            }
        }
    }

    private func chatContent(_ vm: AgentPanelViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(vm.messages) { msg in
                            agentMessageRow(msg)
                                .id(msg.id)
                        }

                        // Streaming content
                        if !vm.streamingContent.isEmpty {
                            HStack(alignment: .top, spacing: 8) {
                                Text(agent.emoji)
                                    .font(.title3)
                                MarkdownTextView(content: vm.streamingContent)
                                    .font(.body)
                            }
                            .padding(.horizontal)
                            .id("streaming")
                        }
                    }
                    .padding(.vertical)
                }
                .defaultScrollAnchor(.bottom)
                .onChange(of: vm.streamingContent) {
                    proxy.scrollTo("streaming", anchor: .bottom)
                }
            }

            Divider()

            // Input
            HStack(spacing: 8) {
                @Bindable var viewModel = vm
                TextField("Ask \(agent.name)...", text: $viewModel.promptText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...4)

                if vm.isStreaming {
                    Button { Task { await vm.stopStreaming() } } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.red)
                    }
                } else {
                    Button { Task { await vm.sendPrompt() } } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(vm.promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .secondary : Color.accentColor)
                    }
                    .disabled(vm.promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.bar)
        }
    }

    private func agentMessageRow(_ msg: MessageResponse) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if msg.isBot {
                Text(agent.emoji)
                    .font(.title3)
            } else {
                AvatarView(msg.displayName, url: msg.avatarURL, size: 28)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(msg.isBot ? agent.name : msg.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(msg.isBot ? Color.accentColor : .primary)
                MarkdownTextView(content: msg.content)
                    .font(.body)
            }
        }
        .padding(.horizontal)
    }

    private func sessionListSheet(_ vm: AgentPanelViewModel) -> some View {
        NavigationStack {
            List(vm.sessions) { session in
                Button {
                    Task { await vm.selectSession(session) }
                    showSessions = false
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(session.title.isEmpty ? "Untitled" : session.title)
                            .font(.subheadline.weight(.medium))
                        if let preview = session.lastAgentMessage, !preview.isEmpty {
                            Text(preview)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                        if let date = Date.fromISO(session.updatedAt) {
                            Text(date.chatTimestamp)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showSessions = false }
                }
            }
        }
    }
}
