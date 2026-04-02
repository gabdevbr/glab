import Foundation

/// Holds the server connection configuration.
/// Persisted in UserDefaults so the app remembers the server URL across launches.
struct ServerEnvironment {
    private static let serverURLKey = "glab_server_url"

    static var serverURL: URL? {
        get {
            guard let string = UserDefaults.standard.string(forKey: serverURLKey) else { return nil }
            return URL(string: string)
        }
        set {
            UserDefaults.standard.set(newValue?.absoluteString, forKey: serverURLKey)
        }
    }

    /// WebSocket URL derived from the server URL.
    /// Converts http→ws, https→wss.
    static var webSocketURL: URL? {
        guard let base = serverURL else { return nil }
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        components?.scheme = base.scheme == "https" ? "wss" : "ws"
        components?.path = "/ws"
        return components?.url
    }

    /// Builds a full API URL from a relative path like "/api/v1/channels".
    static func apiURL(path: String) -> URL? {
        guard let base = serverURL else { return nil }
        return base.appendingPathComponent(path)
    }
}
