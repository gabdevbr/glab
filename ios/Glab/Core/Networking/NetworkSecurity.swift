import Foundation
import Security

/// URLSession delegate that implements SSL certificate pinning.
/// Validates that the server certificate chain contains a trusted certificate.
final class PinnedSessionDelegate: NSObject, URLSessionDelegate, @unchecked Sendable {

    /// SHA-256 hashes of pinned certificate public keys (base64 encoded).
    /// In production, set these to your server's actual certificate fingerprints.
    /// Generate with: `openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`
    private let pinnedHashes: [String]

    /// If true, pinning is enforced. If false, all certificates are accepted (for development).
    private let enforced: Bool

    init(pinnedHashes: [String] = [], enforced: Bool = false) {
        self.pinnedHashes = pinnedHashes
        self.enforced = enforced
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard enforced,
              !pinnedHashes.isEmpty,
              challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            // Not enforced or not SSL — use default handling
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Evaluate the server trust
        let policy = SecPolicyCreateSSL(true, challenge.protectionSpace.host as CFString)
        SecTrustSetPolicies(serverTrust, policy)

        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Check if any certificate in the chain matches our pinned hashes
        guard let certChain = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate] else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        for cert in certChain {
            let certData = SecCertificateCopyData(cert) as Data
            let hash = certData.sha256Base64()

            if pinnedHashes.contains(hash) {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
                return
            }
        }

        // No matching pin found — reject
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}

import CryptoKit

extension Data {
    func sha256Base64() -> String {
        let hash = SHA256.hash(data: self)
        return Data(hash).base64EncodedString()
    }
}
