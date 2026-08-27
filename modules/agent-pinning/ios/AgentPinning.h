#import <Foundation/Foundation.h>
#import <Security/Security.h>

NS_ASSUME_NONNULL_BEGIN

/// Pins React Native's WebSocket connections to the agent's public key.
///
/// React Native builds its iOS WebSocket on SocketRocket rather than
/// NSURLSession, so the URLSessionDelegate server-trust challenge never fires
/// and NSURLSession-based pinning libraries cannot see the connection. What is
/// reachable is SRSecurityPolicy, whose -evaluateServerTrust:forDomain: is
/// documented as an override point; this installs a policy that uses it.
@interface AgentPinning : NSObject

/// Pin subsequent WebSocket connections to `pin` ("sha256/<base64>" over the
/// certificate's SubjectPublicKeyInfo). Passing nil restores ordinary chain
/// validation. Affects connections opened after the call.
+ (void)setPin:(nullable NSString *)pin;

/// The "sha256/<base64>" pin of the leaf certificate `serverTrust` presents,
/// or nil when there is none or its key is not one this app can hash.
///
/// Exposed so the pairing request can be verified by the same computation the
/// socket is, rather than by a second implementation that could drift from it.
+ (nullable NSString *)pinForServerTrust:(SecTrustRef)serverTrust;

@end

NS_ASSUME_NONNULL_END
