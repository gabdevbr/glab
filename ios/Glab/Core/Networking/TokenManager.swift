import Foundation
import KeychainAccess

/// Manages JWT token storage in the iOS Keychain.
/// Provides token read/write and basic JWT expiry checking.
final class TokenManager: @unchecked Sendable {
    private let keychain = Keychain(service: "com.glab.ios")
    private let tokenKey = "jwt_token"

    var token: String? {
        get { try? keychain.get(tokenKey) }
        set {
            if let newValue {
                try? keychain.set(newValue, key: tokenKey)
            } else {
                try? keychain.remove(tokenKey)
            }
        }
    }

    var isTokenValid: Bool {
        guard let token else { return false }
        guard let exp = decodeExpiration(from: token) else { return false }
        return exp > Date()
    }

    /// Clears the stored token (used on logout).
    func clear() {
        token = nil
    }

    // MARK: - JWT Decode (no signature verification — server validates)

    private func decodeExpiration(from jwt: String) -> Date? {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3 else { return nil }

        var base64 = String(parts[1])
        // Pad to multiple of 4
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }

        // JWT uses base64url encoding
        base64 = base64
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else {
            return nil
        }

        return Date(timeIntervalSince1970: exp)
    }
}
