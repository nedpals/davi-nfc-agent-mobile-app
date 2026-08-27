import type { AgentCredential } from "@/types/protocol";

type PinningNativeModule = {
  isSupported: boolean;
  setPin: (pin: string | null) => void;
  postPinned: (
    url: string,
    pin: string | null,
    body: string
  ) => Promise<{ status: number; body: string }>;
};

// The module is absent from Expo Go and from any build predating it, so it is
// required lazily and its absence is a reported state rather than a crash.
let nativeModule: PinningNativeModule | null = null;
let resolved = false;

function getNativeModule(): PinningNativeModule | null {
  if (!resolved) {
    resolved = true;
    try {
      nativeModule = require("@/modules/agent-pinning").default as PinningNativeModule;
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}

export type PinningStatus =
  // A pin is held, it was confirmed at pairing, and this build can enforce it.
  | "pinned"
  /**
   * A pin is held and enforced, but nothing confirmed it was this agent's.
   *
   * Pairing without the agent's QR takes the key from whatever answered, so it
   * still catches a later substitution and still proves nothing about the
   * first exchange. Distinct from "not-applicable": there the answer is that
   * there is no key to check, and here it is that the key was never checked.
   */
  | "unverified"
  // The agent serves no TLS, so there is no key to pin.
  | "not-applicable"
  // A pin is held but this build cannot check it.
  | "unavailable"
  // A pin is held and the connection is cleartext, so it cannot apply.
  | "downgraded";

export interface PinningState {
  status: PinningStatus;
  pin?: string;
}

export class PinningError extends Error {
  readonly status: PinningStatus;

  constructor(message: string, status: PinningStatus) {
    super(message);
    this.name = "PinningError";
    this.status = status;
  }
}

/**
 * Reports without refusing, for a screen that wants to say whether a pin is
 * enforceable before anything is dialled. Cannot see a downgrade, which depends
 * on the URL only `applyPinning` has.
 */
export function describePinning(credential: AgentCredential | null): PinningState {
  const pin = credential?.publicKeyPin ?? "";
  const native = getNativeModule();

  // Checked before anything else: an agent serving no TLS has no key to check,
  // which is a different answer from a key nothing checked.
  if (!pin) {
    native?.setPin(null);
    return { status: "not-applicable" };
  }

  if (!native?.isSupported) {
    return { status: "unavailable", pin };
  }

  // Absent on a credential stored before the field existed, which is the same
  // situation it describes: that pairing was not pinned either.
  return { status: credential?.pinVerified ? "pinned" : "unverified", pin };
}

/**
 * Arms pinning for the socket about to be opened, and throws when a held pin
 * cannot be honoured. A connection that proceeds unverified looks exactly like
 * one that verified, so refusing is the only outcome that cannot be misread.
 */
export function applyPinning(credential: AgentCredential | null, wsUrl: string): PinningState {
  const pin = credential?.publicKeyPin ?? "";
  const native = getNativeModule();

  if (!pin) {
    // A previous connection may have left a pin armed, which would refuse a
    // valid agent that serves no TLS.
    native?.setPin(null);
    return { status: "not-applicable" };
  }

  if (!wsUrl.startsWith("wss://")) {
    native?.setPin(null);
    throw new PinningError(
      "This agent was paired over TLS, so a cleartext connection cannot be verified. " +
        "If the agent now runs with -auto-tls=false, unpair and pair again.",
      "downgraded",
    );
  }

  if (!native?.isSupported) {
    throw new PinningError(
      "This build cannot verify the agent's key. Pinning needs a development build; " +
        "it is not available in Expo Go.",
      "unavailable",
    );
  }

  // Armed either way: a pin taken from whatever answered still refuses a
  // different key later, which is worth having even though it proves nothing
  // about the exchange that recorded it.
  native.setPin(pin);
  return { status: credential?.pinVerified ? "pinned" : "unverified", pin };
}

/**
 * POST to the agent with its key pinned, for the one request that happens
 * before a credential exists.
 *
 * `pin` of `null` is a pairing the caller has decided to make unverified. It is
 * still refused where the module is absent: a build that cannot pin cannot tell
 * a trust-on-first-use pairing from a verified one afterwards either, and a
 * pairing that claims neither is worse than no pairing.
 */
export async function postPinned(
  url: string,
  pin: string | null,
  body: unknown
): Promise<{ status: number; body: string }> {
  const native = getNativeModule();
  if (!native?.isSupported) {
    throw new PinningError(
      "This build cannot verify the agent's key, so it cannot pair. Pairing needs a " +
        "development build; it is not available in Expo Go.",
      "unavailable"
    );
  }

  return native.postPinned(url, pin, JSON.stringify(body));
}
