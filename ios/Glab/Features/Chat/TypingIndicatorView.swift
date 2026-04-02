import SwiftUI

/// Shows who is currently typing in a channel.
struct TypingIndicatorView: View {
    let names: [String]

    var body: some View {
        if !names.isEmpty {
            HStack(spacing: 4) {
                TypingDotsView()
                Text(typingText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 2)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private var typingText: String {
        switch names.count {
        case 1: return "\(names[0]) is typing..."
        case 2: return "\(names[0]) and \(names[1]) are typing..."
        default: return "Several people are typing..."
        }
    }
}

/// Animated "..." dots.
private struct TypingDotsView: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(.secondary)
                    .frame(width: 4, height: 4)
                    .offset(y: animating ? -3 : 0)
                    .animation(.easeInOut(duration: 0.4).repeatForever().delay(Double(i) * 0.15), value: animating)
            }
        }
        .onAppear { animating = true }
    }
}
