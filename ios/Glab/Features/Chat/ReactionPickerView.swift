import SwiftUI

/// Quick emoji reaction picker shown as a popover or sheet.
struct ReactionPickerView: View {
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    private let quickReactions = ["👍", "👎", "😄", "🎉", "❤️", "🚀", "👀", "💯"]
    private let allEmojis: [[String]] = [
        ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇"],
        ["🥰", "😍", "🤩", "😘", "😗", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗"],
        ["🤔", "🤐", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔"],
        ["😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "😱", "😨"],
        ["👍", "👎", "👊", "✊", "🤛", "🤜", "🤝", "👏", "🙌", "👐", "🤲", "🙏"],
        ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💞"],
        ["🔥", "⭐", "🌟", "💫", "✨", "⚡", "🎉", "🎊", "🏆", "🥇", "🎯", "💎"],
        ["✅", "❌", "⚠️", "🚀", "💯", "👀", "🔔", "📌", "🏷️", "💬", "🔗", "📎"],
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Quick reactions
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 12) {
                        ForEach(quickReactions, id: \.self) { emoji in
                            Button {
                                onSelect(emoji)
                                dismiss()
                            } label: {
                                Text(emoji)
                                    .font(.title)
                            }
                        }
                    }
                    .padding(.horizontal)

                    Divider()

                    // All emojis
                    ForEach(allEmojis.indices, id: \.self) { section in
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
                            ForEach(allEmojis[section], id: \.self) { emoji in
                                Button {
                                    onSelect(emoji)
                                    dismiss()
                                } label: {
                                    Text(emoji)
                                        .font(.title2)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("React")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

/// Displays grouped reactions below a message.
struct ReactionBarView: View {
    let reactions: [CachedReaction]
    let currentUserID: String
    let onToggle: (String) -> Void

    var body: some View {
        if !reactions.isEmpty {
            let grouped = Dictionary(grouping: reactions, by: \.emoji)
            FlowLayout(spacing: 4) {
                ForEach(Array(grouped.keys.sorted()), id: \.self) { emoji in
                    let users = grouped[emoji] ?? []
                    let isMine = users.contains { $0.userID == currentUserID }
                    Button {
                        onToggle(emoji)
                    } label: {
                        HStack(spacing: 2) {
                            Text(emoji)
                                .font(.caption)
                            Text("\(users.count)")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(isMine ? .white : .secondary)
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule().fill(isMine ? Color.accentColor.opacity(0.3) : Color.secondary.opacity(0.1))
                        )
                        .overlay(
                            Capsule().strokeBorder(isMine ? Color.accentColor : .clear, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// Simple flow layout for wrapping reactions.
struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (positions: [CGPoint], size: CGSize) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x)
        }

        return (positions, CGSize(width: maxX, height: y + rowHeight))
    }
}
