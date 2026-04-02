import SwiftUI

/// First-time setup: enter the Glab server URL.
struct ServerConfigView: View {
    @Binding var serverURL: String
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)

            Text("Welcome to Glab")
                .font(.title.bold())

            Text("Enter your server URL to get started")
                .foregroundStyle(.secondary)

            TextField("https://chat.example.com", text: $serverURL)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .padding(.horizontal)

            Button("Continue") {
                onContinue()
            }
            .buttonStyle(.borderedProminent)
            .disabled(serverURL.isEmpty)

            Spacer()
        }
        .padding()
    }
}
