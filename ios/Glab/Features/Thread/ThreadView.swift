import SwiftUI
import SwiftData

struct ThreadView: View {
    let parentMessage: CachedMessage

    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var replies: [CachedMessage]

    @State private var viewModel: ThreadViewModel?
    @State private var syncEngine: SyncEngine?

    init(parentMessage: CachedMessage) {
        self.parentMessage = parentMessage
        let parentID = parentMessage.id
        _replies = Query(
            filter: #Predicate<CachedMessage> { $0.threadID == parentID },
            sort: \CachedMessage.createdAt,
            order: .forward
        )
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            // Parent message
                            parentMessageRow
                                .padding(.bottom, 8)

                            Divider()
                                .padding(.horizontal)

                            if replies.isEmpty && viewModel?.isLoading == false {
                                Text("No replies yet")
                                    .foregroundStyle(.secondary)
                                    .padding(.top, 32)
                            }

                            // Thread replies
                            ForEach(replies, id: \.id) { reply in
                                MessageRowView(
                                    message: reply,
                                    showAvatar: true,
                                    currentUserID: appState.currentUser?.id ?? "",
                                    onDelete: { Task { await deleteReply(reply.id) } },
                                    onPin: {},
                                    onReply: {}
                                )
                                .id(reply.id)
                            }
                        }
                    }
                    .defaultScrollAnchor(.bottom)
                    .onChange(of: replies.count) {
                        if let last = replies.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                replyInput
            }
            .navigationTitle("Thread")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
            .task {
                if syncEngine == nil {
                    syncEngine = SyncEngine(modelContainer: modelContext.container)
                }
                if viewModel == nil {
                    viewModel = ThreadViewModel(
                        parentMessageID: parentMessage.id,
                        channelID: parentMessage.channelID,
                        apiClient: appState.apiClient,
                        syncEngine: syncEngine!,
                        webSocketClient: appState.webSocketClient
                    )
                }
                await viewModel?.loadReplies()
            }
        }
    }

    private var parentMessageRow: some View {
        MessageRowView(
            message: parentMessage,
            showAvatar: true,
            currentUserID: appState.currentUser?.id ?? "",
            onDelete: {},
            onPin: {},
            onReply: {}
        )
    }

    @ViewBuilder
    private var replyInput: some View {
        if let viewModel {
            @Bindable var vm = viewModel
            MessageInputView(
                text: $vm.messageText,
                isSending: viewModel.isSending,
                onSend: { Task { await viewModel.sendReply() } },
                onAttach: {},
                onTyping: {}
            )
        }
    }

    private func deleteReply(_ id: String) async {
        let payload = MessageDeletePayload(messageID: id)
        try? await appState.webSocketClient.send(WSEvent.messageDelete, payload: payload)
    }
}
