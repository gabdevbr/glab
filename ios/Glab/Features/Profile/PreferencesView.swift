import SwiftUI

struct PreferencesView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var autoHideDays: Double = 0
    @State private var channelSort = "activity"
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Channel Sort") {
                    Picker("Sort by", selection: $channelSort) {
                        Text("Activity").tag("activity")
                        Text("Name").tag("name")
                        Text("Unread").tag("unread")
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    VStack(alignment: .leading) {
                        Text("Auto-hide inactive channels")
                            .font(.subheadline)
                        Text(autoHideDays == 0 ? "Disabled" : "After \(Int(autoHideDays)) days")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Slider(value: $autoHideDays, in: 0...90, step: 1)
                    }
                } footer: {
                    Text("Channels with no activity will be hidden from the sidebar.")
                }

                Section {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(isSaving)
                }
            }
            .navigationTitle("Preferences")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear {
                autoHideDays = Double(appState.currentUser?.autoHideDays ?? 0)
                channelSort = appState.currentUser?.channelSort ?? "activity"
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        var body: [String: Any] = [:]
        body["auto_hide_days"] = Int(autoHideDays)
        body["channel_sort"] = channelSort
        try? await appState.apiClient.requestVoid(.updatePreferences(body: body))
        let user: UserResponse? = try? await appState.apiClient.request(.me)
        if let user { appState.currentUser = user }
        dismiss()
    }
}
