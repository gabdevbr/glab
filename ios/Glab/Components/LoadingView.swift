import SwiftUI

/// Skeleton loading placeholder for message list.
struct MessageSkeletonView: View {
    @State private var isAnimating = false

    var body: some View {
        VStack(spacing: 16) {
            ForEach(0..<5) { _ in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(.secondary.opacity(0.15))
                        .frame(width: 36, height: 36)

                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(.secondary.opacity(0.15))
                            .frame(width: 120, height: 12)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(.secondary.opacity(0.1))
                            .frame(height: 12)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(.secondary.opacity(0.1))
                            .frame(width: 200, height: 12)
                    }
                }
                .padding(.horizontal)
            }
        }
        .opacity(isAnimating ? 0.6 : 1.0)
        .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: isAnimating)
        .onAppear { isAnimating = true }
    }
}

/// Generic loading overlay.
struct LoadingOverlayView: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.ultraThinMaterial)
    }
}

/// Empty state for channels list.
struct EmptyChannelsView: View {
    var body: some View {
        ContentUnavailableView {
            Label("No Channels", systemImage: "bubble.left.and.bubble.right")
        } description: {
            Text("Join a channel or create a new one to start chatting.")
        }
    }
}

/// Error state with retry.
struct ErrorRetryView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Something went wrong", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again", action: onRetry)
                .buttonStyle(.borderedProminent)
        }
    }
}
