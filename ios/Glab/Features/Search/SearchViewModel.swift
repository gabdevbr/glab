import Foundation

@MainActor
@Observable
final class SearchViewModel {
    var query = ""
    var results: [SearchResultResponse] = []
    var isSearching = false
    var isLoadingMore = false
    var hasSearched = false
    var hasMore = true

    private let apiClient: APIClient
    private var debounceTask: Task<Void, Never>?
    private var currentOffset = 0
    private let pageSize = 50

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func onQueryChanged() {
        debounceTask?.cancel()
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else {
            results = []
            hasSearched = false
            hasMore = true
            currentOffset = 0
            return
        }
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            currentOffset = 0
            await search(q, offset: 0, append: false)
        }
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore, !query.isEmpty else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        await search(query, offset: currentOffset, append: true)
    }

    private func search(_ q: String, offset: Int, append: Bool) async {
        if !append { isSearching = true }
        defer { if !append { isSearching = false }; hasSearched = true }

        do {
            let page: [SearchResultResponse] = try await apiClient.request(
                .search(query: q, limit: pageSize, offset: offset)
            )
            if append {
                results.append(contentsOf: page)
            } else {
                results = page
            }
            currentOffset = offset + page.count
            hasMore = page.count >= pageSize
        } catch {
            if !append { results = [] }
        }
    }
}
