import Foundation

@MainActor
@Observable
final class LoginViewModel {
    var serverURL: String = ServerEnvironment.serverURL?.absoluteString ?? ""
    var username = ""
    var password = ""
    var isLoading = false
    var errorMessage: String?
    var showServerConfig: Bool

    init() {
        showServerConfig = ServerEnvironment.serverURL == nil
    }

    func configureServer() {
        guard let url = URL(string: serverURL), url.scheme != nil else {
            errorMessage = "Please enter a valid URL (e.g. https://chat.example.com)"
            return
        }
        ServerEnvironment.serverURL = url
        showServerConfig = false
    }

    func login(appState: AppState) async {
        guard !username.isEmpty, !password.isEmpty else {
            errorMessage = "Please enter username and password"
            return
        }
        guard let url = ServerEnvironment.serverURL else {
            errorMessage = "Server URL not configured"
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            try await appState.login(serverURL: url, username: username, password: password)
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
