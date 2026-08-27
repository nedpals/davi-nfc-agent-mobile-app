import ExpoModulesCore

/**
 Verifies the agent by its public key for one request, rather than by a chain.

 The agent signs its own certificate, so ordinary evaluation rejects it before
 anything else is consulted. The pin replaces the chain as the identity check:
 what is compared is the SHA-256 of the certificate's SubjectPublicKeyInfo, the
 same value the WebSocket policy compares and the same one the agent prints in
 its pairing QR.

 A nil pin is a deliberate trust-on-first-use pairing. The certificate is still
 accepted — there is nothing to check it against yet — and the caller reports
 the pairing as unverified rather than as a pairing.
 */
private final class PinnedSessionDelegate: NSObject, URLSessionDelegate {
  private let expectedPin: String?

  init(expectedPin: String?) {
    self.expectedPin = expectedPin
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let trust = challenge.protectionSpace.serverTrust else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    guard let expectedPin else {
      completionHandler(.useCredential, URLCredential(trust: trust))
      return
    }

    guard let presented = AgentPinning.pin(forServerTrust: trust), presented == expectedPin else {
      // Cancelling surfaces to the caller as a failed request, which is what a
      // key that is not the agent's should look like.
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    completionHandler(.useCredential, URLCredential(trust: trust))
  }
}

public class AgentPinningModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AgentPinning")

    Property("isSupported") { true }

    Function("setPin") { (pin: String?) in
      AgentPinning.setPin(pin)
    }

    // Pairing is a one-off POST that has to be verified by the same pin the
    // socket is, and it happens before any pin is stored — so it cannot go
    // through setPin, and React Native's fetch has no per-request trust hook.
    // This builds a session for this one request and invalidates it after.
    AsyncFunction("postPinned") {
      (url: String, pin: String?, body: String, promise: Promise) in
      guard let endpoint = URL(string: url) else {
        promise.reject("ERR_AGENT_PINNING_URL", "Not a URL: \(url)")
        return
      }

      var request = URLRequest(url: endpoint)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = body.data(using: .utf8)
      request.timeoutInterval = 15

      let configuration = URLSessionConfiguration.ephemeral
      let session = URLSession(
        configuration: configuration,
        delegate: PinnedSessionDelegate(expectedPin: pin),
        delegateQueue: nil
      )

      session.dataTask(with: request) { data, response, error in
        // Without this the session holds its delegate, and with it this closure,
        // for the life of the process.
        session.finishTasksAndInvalidate()

        if let error {
          promise.reject("ERR_AGENT_PINNING_REQUEST", error.localizedDescription)
          return
        }
        guard let http = response as? HTTPURLResponse else {
          promise.reject("ERR_AGENT_PINNING_REQUEST", "The agent's answer was not HTTP.")
          return
        }
        promise.resolve([
          "status": http.statusCode,
          "body": String(data: data ?? Data(), encoding: .utf8) ?? "",
        ])
      }.resume()
    }
  }
}
