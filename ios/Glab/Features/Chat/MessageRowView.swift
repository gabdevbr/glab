import SwiftUI
import SwiftData

/// Displays a single message in the chat view.
struct MessageRowView: View {
    let message: CachedMessage
    let showAvatar: Bool
    let currentUserID: String
    var reactions: [CachedReaction] = []
    var threadReplyCount: Int = 0
    let onDelete: () -> Void
    let onPin: () -> Void
    let onReply: () -> Void
    var onEdit: (() -> Void)?
    var onReact: (() -> Void)?
    var onToggleReaction: ((String) -> Void)?
    var onImageTap: ((URL) -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if showAvatar {
                AvatarView(message.displayName, url: message.avatarURL, size: 36)
            } else {
                Color.clear.frame(width: 36, height: 0)
            }

            VStack(alignment: .leading, spacing: 4) {
                if showAvatar {
                    HStack(spacing: 6) {
                        Text(message.displayName)
                            .font(.subheadline.weight(.semibold))

                        if message.isBot {
                            Text("BOT")
                                .font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(Capsule().fill(.purple.opacity(0.2)))
                                .foregroundStyle(.purple)
                        }

                        Text(message.createdAt.chatTimestamp)
                            .font(.caption2)
                            .foregroundStyle(.secondary)

                        if message.editedAt != nil {
                            Text("(edited)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Content
                if message.isFile {
                    FileMessageView(message: message, onImageTap: onImageTap)
                } else if message.isSystem {
                    Text(message.content)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .italic()
                } else {
                    MarkdownTextView(content: message.content)
                        .font(.body)
                }

                // Pinned indicator
                if message.isPinned {
                    Label("Pinned", systemImage: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }

                // Reactions
                if !reactions.isEmpty {
                    ReactionBarView(
                        reactions: reactions,
                        currentUserID: currentUserID,
                        onToggle: { emoji in onToggleReaction?(emoji) }
                    )
                }

                // Thread badge
                if threadReplyCount > 0 {
                    Button(action: onReply) {
                        HStack(spacing: 4) {
                            Image(systemName: "bubble.left.and.bubble.right")
                                .font(.caption2)
                            Text("\(threadReplyCount) \(threadReplyCount == 1 ? "reply" : "replies")")
                                .font(.caption.weight(.medium))
                        }
                        .foregroundStyle(Color.accentColor)
                        .padding(.top, 2)
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal)
        .padding(.vertical, showAvatar ? 4 : 1)
        .contextMenu {
            Button { UIPasteboard.general.string = message.content } label: {
                Label("Copy Text", systemImage: "doc.on.doc")
            }

            Button(action: onReply) {
                Label("Reply in Thread", systemImage: "arrowshape.turn.up.left")
            }

            if let onReact {
                Button(action: onReact) {
                    Label("Add Reaction", systemImage: "face.smiling")
                }
            }

            if message.isPinned {
                Button(action: onPin) { Label("Unpin", systemImage: "pin.slash") }
            } else {
                Button(action: onPin) { Label("Pin", systemImage: "pin") }
            }

            if message.userID == currentUserID {
                if let onEdit {
                    Button(action: onEdit) {
                        Label("Edit", systemImage: "pencil")
                    }
                }

                Divider()

                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
    }
}
