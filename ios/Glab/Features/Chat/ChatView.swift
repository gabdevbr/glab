import SwiftUI
import SwiftData

struct ChatView: View {
    let channelID: String

    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var messages: [CachedMessage]
    @Query private var allReactions: [CachedReaction]

    @State private var viewModel: ChatViewModel?
    @State private var syncEngine: SyncEngine?
    @State private var typingDebounce: Task<Void, Never>?

    // Sheets
    @State private var showThread: CachedMessage?
    @State private var showReactionPicker: CachedMessage?
    @State private var showEditSheet: CachedMessage?
    @State private var showFilePicker = false
    @State private var showGiphyPicker = false
    @State private var showSearch = false
    @State private var showChannelInfo = false
    @State private var showPinnedMessages = false
    @State private var showImageViewer: URL?
    @State private var isUploading = false
    @State private var navigateToChannel: String?

    init(channelID: String) {
        self.channelID = channelID
        let id = channelID
        _messages = Query(
            filter: #Predicate<CachedMessage> { $0.channelID == id && $0.threadID == nil },
            sort: \CachedMessage.createdAt,
            order: .forward
        )
        _allReactions = Query(filter: #Predicate<CachedReaction> { _ in true })
    }

    var body: some View {
        VStack(spacing: 0) {
            if viewModel?.isLoading == true && messages.isEmpty {
                MessageSkeletonView()
                    .frame(maxHeight: .infinity)
            } else {
                messageList
            }
            if isUploading {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Uploading...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            typingIndicator
            inputBar
        }
        .navigationTitle(channelName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showSearch = true } label: {
                        Label("Search", systemImage: "magnifyingglass")
                    }
                    Button { showPinnedMessages = true } label: {
                        Label("Pinned Messages", systemImage: "pin")
                    }
                    Button { showChannelInfo = true } label: {
                        Label("Channel Info", systemImage: "info.circle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .accessibilityLabel("Channel options")
                }
            }
        }
        .sheet(item: $showThread) { msg in
            ThreadView(parentMessage: msg)
                .environment(appState)
        }
        .sheet(item: $showReactionPicker) { msg in
            ReactionPickerView { emoji in
                Task { await viewModel?.addReaction(messageID: msg.id, emoji: emoji) }
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $showEditSheet) { msg in
            MessageEditSheet(messageID: msg.id, originalContent: msg.content) { newContent in
                await viewModel?.editMessage(id: msg.id, content: newContent)
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showFilePicker) {
            FilePickerView { data, filename, mimeType in
                Task { await uploadFile(data: data, filename: filename, mimeType: mimeType) }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showGiphyPicker) {
            GiphyPickerView { gifURL in
                Task { await viewModel?.sendGif(gifURL) }
            }
            .environment(appState)
            .presentationDetents([.large])
        }
        .sheet(isPresented: $showSearch) {
            SearchView { targetChannelID, messageID in
                if targetChannelID == channelID {
                    // Same channel — scroll to message (handled by ScrollViewReader)
                    // The message should already be loaded or we can load around it
                } else {
                    navigateToChannel = targetChannelID
                }
            }
            .environment(appState)
        }
        .sheet(isPresented: $showChannelInfo) {
            if let channel = cachedChannel {
                ChannelInfoView(channel: channel)
                    .environment(appState)
            }
        }
        .sheet(isPresented: $showPinnedMessages) {
            PinnedMessagesView(channelID: channelID)
                .environment(appState)
        }
        .fullScreenCover(item: $showImageViewer) { url in
            ImageViewerView(url: url)
        }
        .task {
            if syncEngine == nil {
                syncEngine = SyncEngine(modelContainer: modelContext.container)
            }
            if viewModel == nil {
                viewModel = ChatViewModel(
                    channelID: channelID,
                    apiClient: appState.apiClient,
                    syncEngine: syncEngine!,
                    webSocketClient: appState.webSocketClient,
                    offlineQueue: appState.offlineQueue
                )
            }
            await viewModel?.loadMessages()
            markAsReadIfNeeded()
            try? await syncEngine?.resetUnread(channelID: channelID)

            // Handle pending thread deep link
            if let threadMsgID = appState.pendingThreadMessageID {
                appState.pendingThreadMessageID = nil
                let id = threadMsgID
                let descriptor = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.id == id })
                if let msg = try? modelContext.fetch(descriptor).first {
                    showThread = msg
                }
            }
        }
        .onChange(of: messages.count) {
            markAsReadIfNeeded()
        }
        .errorBanner(Binding(
            get: { viewModel?.errorMessage },
            set: { viewModel?.errorMessage = $0 }
        ))
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if viewModel?.isLoadingMore == true {
                    ProgressView()
                        .padding()
                }

                LazyVStack(spacing: 0) {
                    ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                        let showAvatar = shouldShowAvatar(at: index)
                        let msgReactions = allReactions.filter { $0.messageID == message.id }

                        MessageRowView(
                            message: message,
                            showAvatar: showAvatar,
                            currentUserID: appState.currentUser?.id ?? "",
                            reactions: msgReactions,
                            threadReplyCount: message.threadReplyCount,
                            onDelete: { Task { await viewModel?.deleteMessage(id: message.id) } },
                            onPin: {
                                Task {
                                    if message.isPinned {
                                        await viewModel?.unpinMessage(id: message.id)
                                    } else {
                                        await viewModel?.pinMessage(id: message.id)
                                    }
                                }
                            },
                            onReply: { showThread = message },
                            onEdit: message.userID == appState.currentUser?.id ? { showEditSheet = message } : nil,
                            onReact: { showReactionPicker = message },
                            onToggleReaction: { emoji in
                                Task {
                                    let isMine = msgReactions.contains { $0.emoji == emoji && $0.userID == appState.currentUser?.id }
                                    if isMine {
                                        await viewModel?.removeReaction(messageID: message.id, emoji: emoji)
                                    } else {
                                        await viewModel?.addReaction(messageID: message.id, emoji: emoji)
                                    }
                                }
                            },
                            onImageTap: { url in showImageViewer = url }
                        )
                        .id(message.id)
                        .accessibilityLabel("\(message.displayName): \(message.content)")
                        .onAppear {
                            if index == 0, let firstID = messages.first?.id {
                                Task { await viewModel?.loadMoreMessages(beforeID: firstID) }
                            }
                        }
                    }
                }
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: messages.count) {
                if let last = messages.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        let names = appState.typingService.typingDisplayNames(
            channelID: channelID,
            excludingUserID: appState.currentUser?.id ?? ""
        )
        return TypingIndicatorView(names: names)
            .animation(.easeInOut(duration: 0.2), value: names)
    }

    // MARK: - Input Bar

    @ViewBuilder
    private var inputBar: some View {
        if let viewModel {
            @Bindable var vm = viewModel
            MessageInputView(
                text: $vm.messageText,
                isSending: viewModel.isSending,
                onSend: { Task { await viewModel.sendMessage() } },
                onAttach: { showFilePicker = true },
                onGiphy: { showGiphyPicker = true },
                onTyping: {
                    typingDebounce?.cancel()
                    Task { await viewModel.sendTypingStart() }
                    typingDebounce = Task {
                        try? await Task.sleep(for: .seconds(3))
                        await viewModel.sendTypingStop()
                    }
                }
            )
            .safeAreaInset(edge: .bottom) { EmptyView() }
        }
    }

    // MARK: - File Upload

    private func uploadFile(data: Data, filename: String, mimeType: String) async {
        isUploading = true
        defer { isUploading = false }

        do {
            let _: FileResponse = try await appState.apiClient.upload(
                .uploadFile(channelID: channelID),
                fileData: data, fileName: filename, mimeType: mimeType
            )
        } catch {
            viewModel?.errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    private var channelName: String {
        cachedChannel?.name ?? "Chat"
    }

    private var cachedChannel: CachedChannel? {
        let id = channelID
        let descriptor = FetchDescriptor<CachedChannel>(predicate: #Predicate { $0.id == id })
        return try? modelContext.fetch(descriptor).first
    }

    private func shouldShowAvatar(at index: Int) -> Bool {
        guard index > 0 else { return true }
        return messages[index - 1].userID != messages[index].userID
    }

    private func markAsReadIfNeeded() {
        guard let lastMessage = messages.last else { return }
        Task { await viewModel?.markAsRead(lastMessageID: lastMessage.id) }
    }
}

// MARK: - Identifiable conformances for sheet items

extension CachedMessage: Identifiable {}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}
