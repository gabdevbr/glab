import SwiftUI
import NukeUI

struct GiphyGif: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let images: GiphyImages

    struct GiphyImages: Decodable, Hashable {
        let fixedWidthSmall: GiphyImage?
        let original: GiphyImage?

        enum CodingKeys: String, CodingKey {
            case fixedWidthSmall = "fixed_width_small"
            case original
        }
    }

    struct GiphyImage: Decodable, Hashable {
        let url: String?
        let width: String?
        let height: String?
    }
}

struct GiphySearchResponse: Decodable {
    let data: [GiphyGif]
}

struct GiphyPickerView: View {
    let onSelect: (String) -> Void // Returns the GIF URL to send as message content
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var gifs: [GiphyGif] = []
    @State private var isLoading = false
    @State private var debounceTask: Task<Void, Never>?

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TextField("Search GIFs...", text: $searchText)
                    .textFieldStyle(.roundedBorder)
                    .padding()
                    .onChange(of: searchText) {
                        debounceTask?.cancel()
                        debounceTask = Task {
                            try? await Task.sleep(for: .milliseconds(300))
                            guard !Task.isCancelled else { return }
                            await search()
                        }
                    }

                if isLoading {
                    ProgressView()
                        .padding()
                    Spacer()
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 4) {
                            ForEach(gifs) { gif in
                                if let urlString = gif.images.fixedWidthSmall?.url, let url = URL(string: urlString) {
                                    Button {
                                        let originalURL = gif.images.original?.url ?? urlString
                                        onSelect(originalURL)
                                        dismiss()
                                    } label: {
                                        LazyImage(url: url) { state in
                                            if let image = state.image {
                                                image.resizable().scaledToFill()
                                            } else {
                                                Color.secondary.opacity(0.1)
                                            }
                                        }
                                        .frame(height: 120)
                                        .clipShape(RoundedRectangle(cornerRadius: 6))
                                    }
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }
            }
            .navigationTitle("GIFs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                await loadTrending()
            }
        }
    }

    private func loadTrending() async {
        isLoading = true
        defer { isLoading = false }
        let response: GiphySearchResponse? = try? await appState.apiClient.request(.giphyTrending())
        gifs = response?.data ?? []
    }

    private func search() async {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            await loadTrending()
            return
        }
        isLoading = true
        defer { isLoading = false }
        let response: GiphySearchResponse? = try? await appState.apiClient.request(.giphySearch(query: q))
        gifs = response?.data ?? []
    }
}
