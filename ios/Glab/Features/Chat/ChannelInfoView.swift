import SwiftUI

struct ChannelInfoView: View {
    let channel: CachedChannel

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var members: [UserResponse] = []
    @State private var isLoading = true
    @State private var showLeaveAlert = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: channel.isDM ? "person.2.fill" : channel.isPrivate ? "lock.fill" : "number")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(.secondary.opacity(0.1)))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(channel.name)
                                .font(.title3.weight(.semibold))
                            Text(channel.type.capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let topic = channel.topic, !topic.isEmpty {
                    Section("Topic") {
                        Text(topic)
                            .font(.subheadline)
                    }
                }

                if let desc = channel.channelDescription, !desc.isEmpty {
                    Section("Description") {
                        Text(desc)
                            .font(.subheadline)
                    }
                }

                Section("Details") {
                    LabeledContent("Members", value: "\(channel.memberCount)")
                    if channel.readOnly {
                        LabeledContent("Read Only", value: "Yes")
                    }
                    if let created = Date.fromISO(nil) ?? channel.createdAt as Date? {
                        LabeledContent("Created", value: created.relativeDay)
                    }
                }

                if !channel.isDM {
                    Section {
                        Button(role: .destructive) {
                            showLeaveAlert = true
                        } label: {
                            Label("Leave Channel", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                }
            }
            .navigationTitle("Channel Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .alert("Leave Channel?", isPresented: $showLeaveAlert) {
                Button("Leave", role: .destructive) {
                    Task {
                        try? await appState.apiClient.requestVoid(.leaveChannel(id: channel.id))
                        await appState.onChannelsNeedRefresh?()
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You will no longer receive messages from #\(channel.name).")
            }
        }
    }
}
