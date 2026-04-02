import SwiftUI

struct ChangePasswordView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var success = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Current Password", text: $currentPassword)
                    SecureField("New Password", text: $newPassword)
                    SecureField("Confirm New Password", text: $confirmPassword)
                }

                if let error = errorMessage {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }

                if success {
                    Section { Text("Password changed successfully").foregroundStyle(.green).font(.caption) }
                }

                Section {
                    Button("Change Password") {
                        Task { await changePassword() }
                    }
                    .disabled(isSaving || currentPassword.isEmpty || newPassword.isEmpty || newPassword != confirmPassword)
                }
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func changePassword() async {
        guard newPassword == confirmPassword else {
            errorMessage = "Passwords do not match"
            return
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            try await appState.apiClient.requestVoid(.changePassword(currentPassword: currentPassword, newPassword: newPassword))
            success = true
            currentPassword = ""
            newPassword = ""
            confirmPassword = ""
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
