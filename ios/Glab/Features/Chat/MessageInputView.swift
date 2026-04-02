import SwiftUI

/// Text input bar at the bottom of the chat view.
struct MessageInputView: View {
    @Binding var text: String
    let isSending: Bool
    let onSend: () -> Void
    let onAttach: () -> Void
    var onGiphy: (() -> Void)?
    let onTyping: () -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Menu {
                Button(action: onAttach) {
                    Label("Photo or File", systemImage: "photo.on.rectangle")
                }
                if let onGiphy {
                    Button(action: onGiphy) {
                        Label("GIF", systemImage: "gift")
                    }
                }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Attach")
            }

            TextField("Message", text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...6)
                .focused($isFocused)
                .onChange(of: text) {
                    onTyping()
                }
                .onSubmit {
                    if !text.isEmpty {
                        onSend()
                    }
                }
                .accessibilityLabel("Message text field")

            Button(action: onSend) {
                if isSending {
                    ProgressView()
                        .frame(width: 28, height: 28)
                } else {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .secondary : Color.accentColor)
                }
            }
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
            .accessibilityLabel("Send message")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }
}
