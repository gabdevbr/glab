import Foundation

/// Handles sidebar sections CRUD.
struct SectionService {
    let apiClient: APIClient

    func listSections() async throws -> [SectionResponse] {
        try await apiClient.request(.listSections)
    }

    func createSection(name: String) async throws -> SectionResponse {
        try await apiClient.request(.createSection(name: name))
    }

    func updateSection(id: String, name: String) async throws {
        try await apiClient.requestVoid(.updateSection(id: id, name: name))
    }

    func deleteSection(id: String) async throws {
        try await apiClient.requestVoid(.deleteSection(id: id))
    }

    func reorderSections(ids: [String]) async throws {
        try await apiClient.requestVoid(.reorderSections(sectionIDs: ids))
    }

    func moveChannel(channelID: String, toSection sectionID: String?) async throws {
        try await apiClient.requestVoid(.moveChannelToSection(channelID: channelID, sectionID: sectionID))
    }
}
