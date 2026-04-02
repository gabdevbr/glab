import SwiftUI

struct SearchView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: SearchViewModel?

    let onNavigate: (String, String) -> Void // (channelID, messageID)

    var body: some View {
        NavigationStack {
            Group {
                if let viewModel {
                    searchContent(viewModel)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                if viewModel == nil {
                    viewModel = SearchViewModel(apiClient: appState.apiClient)
                }
            }
        }
    }

    private func searchContent(_ vm: SearchViewModel) -> some View {
        VStack(spacing: 0) {
            @Bindable var viewModel = vm
            TextField("Search messages...", text: $viewModel.query)
                .textFieldStyle(.roundedBorder)
                .padding()
                .accessibilityLabel("Search messages")
                .onChange(of: vm.query) {
                    vm.onQueryChanged()
                }

            if vm.isSearching {
                ProgressView("Searching...")
                    .padding()
                Spacer()
            } else if vm.results.isEmpty && vm.hasSearched {
                ContentUnavailableView.search(text: vm.query)
            } else {
                List {
                    ForEach(vm.results) { result in
                        Button {
                            onNavigate(result.channelID, result.id)
                            dismiss()
                        } label: {
                            searchResultRow(result)
                        }
                        .buttonStyle(.plain)
                        .onAppear {
                            // Infinite scroll — load more when near bottom
                            if result.id == vm.results.last?.id {
                                Task { await vm.loadMore() }
                            }
                        }
                    }

                    if vm.isLoadingMore {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private func searchResultRow(_ result: SearchResultResponse) -> some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(result.displayName, url: result.avatarURL, size: 32)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(result.displayName)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    if let date = Date.fromISO(result.createdAt) {
                        Text(date.chatTimestamp)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(result.content)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
