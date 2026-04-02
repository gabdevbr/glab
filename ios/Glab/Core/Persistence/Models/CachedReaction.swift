import Foundation
import SwiftData

@Model
final class CachedReaction {
    var messageID: String
    var emoji: String
    var userID: String
    var username: String

    init(messageID: String, emoji: String, userID: String, username: String) {
        self.messageID = messageID
        self.emoji = emoji
        self.userID = userID
        self.username = username
    }
}
