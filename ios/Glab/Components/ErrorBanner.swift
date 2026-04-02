import SwiftUI

/// In-app error banner that slides down from the top.
struct ErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.white)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.white)
                .lineLimit(2)
            Spacer()
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(.red.gradient))
        .padding(.horizontal)
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityLabel("Error: \(message)")
    }
}

/// View modifier that shows error banners from an observable error state.
struct ErrorBannerModifier: ViewModifier {
    @Binding var errorMessage: String?

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let message = errorMessage {
                ErrorBanner(message: message) {
                    withAnimation { errorMessage = nil }
                }
                .padding(.top, 8)
                .onAppear {
                    // Auto-dismiss after 5 seconds
                    Task {
                        try? await Task.sleep(for: .seconds(5))
                        withAnimation { errorMessage = nil }
                    }
                }
            }
        }
        .animation(.spring(duration: 0.3), value: errorMessage)
    }
}

extension View {
    func errorBanner(_ message: Binding<String?>) -> some View {
        modifier(ErrorBannerModifier(errorMessage: message))
    }
}
