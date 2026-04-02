import Foundation
import SwiftData

@MainActor
@Observable
final class SidebarViewModel {
    var isLoading = false
    var errorMessage: String?

    private let channelService: ChannelService
    private let syncEngine: SyncEngine

    init(apiClient: APIClient, syncEngine: SyncEngine) {
        self.channelService = ChannelService(apiClient: apiClient)
        self.syncEngine = syncEngine
    }

    func loadChannels() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let channels = try await channelService.listChannels()
            try await syncEngine.syncChannels(channels)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func hideChannel(id: String) async {
        try? await channelService.hideChannel(id: id, hidden: true)
        await loadChannels()
    }

    func pinChannel(id: String, pinned: Bool) async {
        try? await channelService.pinChannel(id: id, pinned: pinned)
        await loadChannels()
    }

    func markAllRead() async {
        try? await channelService.markAllRead()
        await loadChannels()
    }
}
