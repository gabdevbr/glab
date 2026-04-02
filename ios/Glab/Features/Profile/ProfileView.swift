import SwiftUI
import PhotosUI

struct ProfileView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var email = ""
    @State private var isSaving = false
    @State private var showPreferences = false
    @State private var showChangePassword = false
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var isUploadingAvatar = false
    @State private var successMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        VStack(spacing: 8) {
                            AvatarView(
                                appState.currentUser?.displayName ?? "",
                                url: appState.currentUser?.avatarURL,
                                size: 80
                            )
                            .overlay(alignment: .bottomTrailing) {
                                if isUploadingAvatar {
                                    ProgressView()
                                        .controlSize(.small)
                                        .frame(width: 24, height: 24)
                                        .background(Circle().fill(.background))
                                } else {
                                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                                        Image(systemName: "camera.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(Color.accentColor)
                                            .background(Circle().fill(.background))
                                    }
                                }
                            }

                            Text("@\(appState.currentUser?.username ?? "")")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            if appState.currentUser?.role == "admin" {
                                Text("Admin")
                                    .font(.caption.weight(.bold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(.orange.opacity(0.2)))
                                    .foregroundStyle(.orange)
                            }
                        }
                        Spacer()
                    }
                }

                Section("Profile") {
                    TextField("Display Name", text: $displayName)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                }

                Section {
                    Button("Save Profile") {
                        Task { await saveProfile() }
                    }
                    .disabled(isSaving)
                }

                Section {
                    Button("Preferences") { showPreferences = true }
                    Button("Change Password") { showChangePassword = true }
                }

                if appState.currentUser?.role == "admin" {
                    Section {
                        NavigationLink("Admin Panel") {
                            AdminDashboardView()
                                .environment(appState)
                        }
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        appState.logout()
                        dismiss()
                    }
                }

                if let msg = successMessage {
                    Section {
                        Text(msg)
                            .foregroundStyle(.green)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .sheet(isPresented: $showPreferences) {
                PreferencesView()
                    .environment(appState)
            }
            .sheet(isPresented: $showChangePassword) {
                ChangePasswordView()
                    .environment(appState)
            }
            .onChange(of: selectedPhoto) { _, item in
                guard let item else { return }
                Task { await uploadAvatar(item) }
            }
            .onAppear {
                displayName = appState.currentUser?.displayName ?? ""
                email = appState.currentUser?.email ?? ""
            }
        }
    }

    private func saveProfile() async {
        guard let userID = appState.currentUser?.id else { return }
        isSaving = true
        defer { isSaving = false }

        var body: [String: Any] = [:]
        if displayName != appState.currentUser?.displayName { body["display_name"] = displayName }
        if email != appState.currentUser?.email { body["email"] = email }
        guard !body.isEmpty else { return }

        do {
            try await appState.apiClient.requestVoid(.updateUser(id: userID, body: body))
            let user: UserResponse = try await appState.apiClient.request(.me)
            appState.currentUser = user
            successMessage = "Profile updated"
        } catch {}
    }

    private func uploadAvatar(_ item: PhotosPickerItem) async {
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }

        guard let data = try? await item.loadTransferable(type: Data.self),
              let userID = appState.currentUser?.id else { return }

        let ext = item.supportedContentTypes.first?.preferredFilenameExtension ?? "png"
        let mimeType = item.supportedContentTypes.first?.preferredMIMEType ?? "image/png"

        do {
            let _: UserResponse = try await appState.apiClient.upload(
                .uploadAvatar(userID: userID),
                fileData: data,
                fileName: "avatar.\(ext)",
                mimeType: mimeType
            )
            let user: UserResponse = try await appState.apiClient.request(.me)
            appState.currentUser = user
        } catch {}
    }
}
