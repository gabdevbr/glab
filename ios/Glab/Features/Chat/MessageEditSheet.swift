import SwiftUI

/// Sheet for editing a message's content.
struct MessageEditSheet: View {
    let messageID: String
    let originalContent: String
    let onSave: (String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var content: String
    @State private var isSaving = false
    @FocusState private var isFocused: Bool

    init(messageID: String, originalContent: String, onSave: @escaping (String) async -> Void) {
        self.messageID = messageID
        self.originalContent = originalContent
        self.onSave = onSave
        _content = State(initialValue: originalContent)
    }

    var body: some View {
        NavigationStack {
            VStack {
                TextField("Message", text: $content, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(3...12)
                    .focused($isFocused)
                    .padding()

                Spacer()
            }
            .navigationTitle("Edit Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            await onSave(content)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              content == originalContent || isSaving)
                }
            }
            .onAppear { isFocused = true }
        }
    }
}
