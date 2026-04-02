import SwiftUI

/// A single row in the channel list sidebar.
struct ChannelRowView: View {
    let channel: CachedChannel
    let presenceStatus: String?
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 10) {
            channelIcon
                .frame(width: 20)

            Text(channel.name)
                .lineLimit(1)
                .fontWeight(channel.unreadCount > 0 ? .semibold : .regular)

            Spacer()

            if channel.unreadCount > 0 {
                BadgeView(count: channel.unreadCount)
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(isSelected ? Color.accentColor.opacity(0.1) : .clear)
        .cornerRadius(6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(channel.isDM ? "Direct message" : "Channel") \(channel.name)\(channel.unreadCount > 0 ? ", \(channel.unreadCount) unread" : "")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    @ViewBuilder
    private var channelIcon: some View {
        if channel.isDM {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(channel.name, size: 20)
                if let status = presenceStatus {
                    PresenceDot(status: status, size: 8)
                        .offset(x: 2, y: 2)
                }
            }
        } else if channel.isPrivate {
            Image(systemName: "lock.fill")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else {
            Image(systemName: "number")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
