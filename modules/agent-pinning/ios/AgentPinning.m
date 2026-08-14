#import "AgentPinning.h"

#import <CommonCrypto/CommonDigest.h>
#import <Security/Security.h>
#import <objc/runtime.h>

#import <SocketRocket/SRSecurityPolicy.h>
#import <SocketRocket/SRWebSocket.h>

// SubjectPublicKeyInfo header for an ECDSA P-256 key, which is what the agent
// generates. SecKeyCopyExternalRepresentation hands back the raw key rather
// than SPKI DER, so this has to be prepended before hashing or the digest can
// never match the agent's — the agent hashes the SPKI.
static const uint8_t kP256SPKIHeader[] = {
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00};

static NSString *gExpectedPin = nil;
static NSLock *gPinLock = nil;

static NSString *AgentPinningCurrentPin(void) {
  [gPinLock lock];
  NSString *pin = gExpectedPin;
  [gPinLock unlock];
  return pin;
}

#pragma mark - Policy

@interface AgentPinningSecurityPolicy : SRSecurityPolicy
- (instancetype)initWithExpectedPin:(NSString *)pin;
@end

@implementation AgentPinningSecurityPolicy {
  NSString *_expectedPin;
}

- (instancetype)initWithExpectedPin:(NSString *)pin {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  // Chain validation is switched off deliberately, and this is the subtle part.
  // SRSecurityPolicy applies it to the stream itself via
  // kCFStreamSSLValidatesCertificateChain, so with it on, the agent's
  // self-signed certificate is refused during the handshake and
  // -evaluateServerTrust:forDomain: below is never reached — the iOS mirror of
  // OkHttp's CertificatePinner running after chain validation. The key pin
  // replaces the chain as the identity check rather than supplementing it.
  self = [super initWithCertificateChainValidationEnabled:NO];
#pragma clang diagnostic pop
  if (self) {
    _expectedPin = [pin copy];
  }
  return self;
}

- (SecCertificateRef)leafCertificateOfTrust:(SecTrustRef)serverTrust CF_RETURNS_NOT_RETAINED {
  if (@available(iOS 15.0, *)) {
    CFArrayRef chain = SecTrustCopyCertificateChain(serverTrust);
    if (chain == NULL) {
      return NULL;
    }
    SecCertificateRef leaf = NULL;
    if (CFArrayGetCount(chain) > 0) {
      leaf = (SecCertificateRef)CFArrayGetValueAtIndex(chain, 0);
      // Keep it alive past the release of the containing array.
      leaf = (SecCertificateRef)CFAutorelease(CFRetain(leaf));
    }
    CFRelease(chain);
    return leaf;
  }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  return SecTrustGetCertificateAtIndex(serverTrust, 0);
#pragma clang diagnostic pop
}

- (NSString *)pinForCertificate:(SecCertificateRef)certificate {
  SecKeyRef publicKey = SecCertificateCopyKey(certificate);
  if (publicKey == NULL) {
    return nil;
  }

  NSDictionary *attributes = (__bridge_transfer NSDictionary *)SecKeyCopyAttributes(publicKey);
  NSString *keyType = attributes[(__bridge NSString *)kSecAttrKeyType];
  NSNumber *keySize = attributes[(__bridge NSString *)kSecAttrKeySizeInBits];

  // Only P-256 is handled, because the SPKI header prepended below is specific
  // to it. Refusing an unexpected key type is the right outcome: a guessed
  // header would produce a digest that silently never matches.
  if (![keyType isEqualToString:(__bridge NSString *)kSecAttrKeyTypeECSECPrimeRandom] ||
      keySize.integerValue != 256) {
    CFRelease(publicKey);
    return nil;
  }

  CFErrorRef error = NULL;
  NSData *rawKey = (__bridge_transfer NSData *)SecKeyCopyExternalRepresentation(publicKey, &error);
  CFRelease(publicKey);
  if (rawKey == nil) {
    if (error != NULL) {
      CFRelease(error);
    }
    return nil;
  }

  NSMutableData *spki = [NSMutableData dataWithBytes:kP256SPKIHeader length:sizeof(kP256SPKIHeader)];
  [spki appendData:rawKey];

  uint8_t digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(spki.bytes, (CC_LONG)spki.length, digest);
  NSData *digestData = [NSData dataWithBytes:digest length:sizeof(digest)];

  return [@"sha256/" stringByAppendingString:[digestData base64EncodedStringWithOptions:0]];
}

- (BOOL)evaluateServerTrust:(SecTrustRef)serverTrust forDomain:(NSString *)domain {
  SecCertificateRef leaf = [self leafCertificateOfTrust:serverTrust];
  if (leaf == NULL) {
    return NO;
  }

  NSString *presented = [self pinForCertificate:leaf];
  if (presented == nil) {
    return NO;
  }

  // Constant-time-ish compare is unnecessary here: the pin is public, and the
  // secret is the private key the agent never sends.
  return [presented isEqualToString:_expectedPin];
}

@end

#pragma mark - Injection

// React Native constructs its socket as -initWithURLRequest:protocols:, which
// supplies a default policy and offers no hook. Routing that initializer to the
// securityPolicy: variant is what lets a pinning policy be used without
// forking React Native or replacing its WebSocket module.
static SRWebSocket *(*gOriginalInit)(id, SEL, NSURLRequest *, NSArray *) = NULL;

static SRWebSocket *AgentPinningInit(id self, SEL _cmd, NSURLRequest *request, NSArray *protocols) {
  NSString *pin = AgentPinningCurrentPin();
  if (pin.length == 0) {
    return gOriginalInit(self, _cmd, request, protocols);
  }

  AgentPinningSecurityPolicy *policy = [[AgentPinningSecurityPolicy alloc] initWithExpectedPin:pin];
  return [self initWithURLRequest:request protocols:protocols securityPolicy:policy];
}

@implementation AgentPinning

// dispatch_once rather than +initialize alone: swizzling twice would capture
// this function as its own original and recurse forever on the first connect.
static void AgentPinningInstall(void) {
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    gPinLock = [NSLock new];

    Method original =
        class_getInstanceMethod([SRWebSocket class], @selector(initWithURLRequest:protocols:));
    if (original == NULL) {
      return;
    }
    gOriginalInit =
        (SRWebSocket * (*)(id, SEL, NSURLRequest *, NSArray *))method_getImplementation(original);
    method_setImplementation(original, (IMP)AgentPinningInit);
  });
}

+ (void)setPin:(NSString *)pin {
  AgentPinningInstall();
  [gPinLock lock];
  gExpectedPin = [pin copy];
  [gPinLock unlock];
}

@end
