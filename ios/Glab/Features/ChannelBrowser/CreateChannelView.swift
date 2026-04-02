import SwiftUI

struct CreateChannelView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var channelType = "public"
    @State private var isCreating = false
    @State private var errorMessage: String?

    // For DM creation
    @State private var users: [UserResponse] = []
    @State private var selectedUser: UserResponse?
    @State private var userSearchText = ""

    let onCreated: ((String) -> Void)?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Type", selection: $channelType) {
                        Text("Public").tag("public")
                        Text("Private").tag("private")
                        Text("Direct Message").tag("dm")
                    }
                    .pickerStyle(.segmented)
                }

                if channelType == "dm" {
                    dmSection
                } else {
                    channelSection
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("New \(channelType == "dm" ? "Message" : "Channel")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await create() }
                    }
                    .disabled(isCreateDisabled || isCreating)
                }
            }
            .task {
                if users.isEmpty {
                    users = (try? await appState.apiClient.request(.listUsers()) as [UserResponse]) ?? []
                }
            }
        }
    }

    private var channelSection: some View {
        Section {
            TextField("Channel name", text: $name)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextField("Description (optional)", text: $description)
        }
    }

    private var dmSection: some View {
        Section("Select User") {
            TextField("Search users...", text: $userSearchText)
            ForEach(filteredUsers) { user in
                Button {
                    selectedUser = user
                } label: {
                    HStack {
                        AvatarView(user.displayName, url: user.avatarURL, size: 28)
                        VStack(alignment: .leading) {
                            Text(user.displayName)
                                .font(.subheadline.weight(.medium))
                            Text("@\(user.username)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if selectedUser?.id == user.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var filteredUsers: [UserResponse] {
        let others = users.filter { $0.id != appState.currentUser?.id && !$0.isBot }
        if userSearchText.isEmpty { return others }
        return others.filter {
            $0.displayName.localizedCaseInsensitiveContains(userSearchText) ||
            $0.username.localizedCaseInsensitiveContains(userSearchText)
        }
    }

    private var isCreateDisabled: Bool {
        if channelType == "dm" { return selectedUser == nil }
        return name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func create() async {
        isCreating = true
        defer { isCreating = false }
        errorMessage = nil

        do {
            var body: [String: Any] = ["type": channelType]
            if channelType == "dm" {
                body["name"] = "dm"
                body["member_id"] = selectedUser?.id
            } else {
                body["name"] = name.trimmingCharacters(in: .whitespacesAndNewlines)
                if !description.isEmpty { body["description"] = description }
            }
            let channel: ChannelResponse = try await appState.apiClient.request(.createChannel(body: body))
            await appState.onChannelsNeedRefresh?()
            onCreated?(channel.id)
            dismiss()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
