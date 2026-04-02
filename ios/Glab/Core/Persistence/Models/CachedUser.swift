import Foundation
import SwiftData

@Model
final class CachedUser {
    @Attribute(.unique) var id: String
    var username: String
    var displayName: String
    var avatarURL: String?
    var role: String
    var isBot: Bool

    init(id: String, username: String, displayName: String, avatarURL: String? = nil, role: String = "user", isBot: Bool = false) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.role = role
        self.isBot = isBot
    }
}
