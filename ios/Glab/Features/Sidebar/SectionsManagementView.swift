import SwiftUI

struct SectionsManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var sections: [SectionResponse] = []
    @State private var isLoading = true
    @State private var newSectionName = ""
    @State private var editingSection: SectionResponse?
    @State private var editName = ""

    private var sectionService: SectionService {
        SectionService(apiClient: appState.apiClient)
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Create Section") {
                    HStack {
                        TextField("Section name", text: $newSectionName)
                        Button("Add") {
                            Task { await createSection() }
                        }
                        .disabled(newSectionName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                Section("Sections") {
                    if isLoading {
                        ProgressView()
                    } else if sections.isEmpty {
                        Text("No sections yet")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(sections) { section in
                            HStack {
                                if editingSection?.id == section.id {
                                    TextField("Name", text: $editName)
                                        .onSubmit { Task { await renameSection(section) } }
                                    Button("Save") { Task { await renameSection(section) } }
                                        .buttonStyle(.borderedProminent)
                                        .controlSize(.small)
                                } else {
                                    Text(section.name)
                                    Spacer()
                                    Text("\(section.channelIDs.count) channels")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await deleteSection(section.id) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button {
                                    editingSection = section
                                    editName = section.name
                                } label: {
                                    Label("Rename", systemImage: "pencil")
                                }
                                .tint(.orange)
                            }
                        }
                        .onMove { from, to in
                            var reordered = sections
                            reordered.move(fromOffsets: from, toOffset: to)
                            sections = reordered
                            Task { await reorderSections() }
                        }
                    }
                }
            }
            .navigationTitle("Sections")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    EditButton()
                }
            }
            .task { await loadSections() }
        }
    }

    private func loadSections() async {
        isLoading = true
        sections = (try? await sectionService.listSections()) ?? []
        isLoading = false
    }

    private func createSection() async {
        let name = newSectionName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        _ = try? await sectionService.createSection(name: name)
        newSectionName = ""
        await loadSections()
    }

    private func renameSection(_ section: SectionResponse) async {
        let name = editName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        try? await sectionService.updateSection(id: section.id, name: name)
        editingSection = nil
        await loadSections()
    }

    private func deleteSection(_ id: String) async {
        try? await sectionService.deleteSection(id: id)
        await loadSections()
    }

    private func reorderSections() async {
        let ids = sections.map(\.id)
        try? await sectionService.reorderSections(ids: ids)
    }
}
