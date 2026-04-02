import SwiftUI

struct RetentionConfig: Codable {
    let defaultDays: Int
    let minimumDays: Int

    enum CodingKeys: String, CodingKey {
        case defaultDays = "default_days"
        case minimumDays = "minimum_days"
    }
}

struct EditTimeoutConfig: Codable {
    let seconds: Int
}

struct AdminSettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var retentionDefault: Double = 0
    @State private var retentionMinimum: Double = 0
    @State private var editTimeout: Double = 900
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var successMessage: String?

    var body: some View {
        Form {
            Section("Message Retention") {
                VStack(alignment: .leading) {
                    Text("Default: \(Int(retentionDefault)) days")
                        .font(.subheadline)
                    Slider(value: $retentionDefault, in: 0...365, step: 1)
                    Text("0 = keep forever")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading) {
                    Text("Minimum: \(Int(retentionMinimum)) days")
                        .font(.subheadline)
                    Slider(value: $retentionMinimum, in: 0...365, step: 1)
                }
            }

            Section("Message Edit Timeout") {
                VStack(alignment: .leading) {
                    Text(editTimeout == 0 ? "No limit" : "\(Int(editTimeout / 60)) minutes")
                        .font(.subheadline)
                    Slider(value: $editTimeout, in: 0...3600, step: 60)
                    Text("0 = users can always edit")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button("Save Settings") {
                    Task { await save() }
                }
                .disabled(isSaving)
            }

            if let msg = successMessage {
                Section {
                    Text(msg).foregroundStyle(.green).font(.caption)
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadSettings() }
    }

    private func loadSettings() async {
        isLoading = true
        defer { isLoading = false }

        if let config: RetentionConfig = try? await appState.apiClient.request(.adminRetentionConfig) {
            retentionDefault = Double(config.defaultDays)
            retentionMinimum = Double(config.minimumDays)
        }
        if let config: EditTimeoutConfig = try? await appState.apiClient.request(.adminEditTimeoutConfig) {
            editTimeout = Double(config.seconds)
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        successMessage = nil

        try? await appState.apiClient.requestVoid(.adminUpdateRetention(defaultDays: Int(retentionDefault), minimumDays: Int(retentionMinimum)))
        try? await appState.apiClient.requestVoid(.adminUpdateEditTimeout(seconds: Int(editTimeout)))
        successMessage = "Settings saved"
    }
}
