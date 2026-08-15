import type { AgentCredential } from "@/types/protocol";

type PinningNativeModule = {
  isSupported: boolean;
  setPin: (pin: string | null) => void;
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
  // The agent's key will be checked on this connection.
  | "pinned"
  // The agent serves no TLS, so there is no key to pin and nothing to verify.
  | "not-applicable"
  // A pin is held but this build cannot check it.
  | "unavailable"
  // A pin is held and the connection is not TLS, so the pin cannot apply.
  | "downgraded";

export interface PinningState {
  status: PinningStatus;
  pin?: string;
}

/**
 * Refused rather than connected. Carries the status so a caller can say which
 * of the two refusals it was.
 */
export class PinningError extends Error {
  readonly status: PinningStatus;

  constructor(message: string, status: PinningStatus) {
    super(message);
    this.name = "PinningError";
    this.status = status;
  }
}

/**
 * What this build could do with the credential it holds, without dialling
 * anything. Settings asks this so it can say whether the pin is enforceable
 * before a connection is attempted.
 *
 * Reports rather than refuses, and cannot see a downgrade — that depends on the
 * URL, which only `applyPinning` has.
 */
export function describePinning(credential: AgentCredential | null): PinningState {
  const pin = credential?.publicKeyPin ?? "";
  const native = getNativeModule();

  if (!pin) {
    native?.setPin(null);
    return { status: "not-applicable" };
  }

  return native?.isSupported ? { status: "pinned", pin } : { status: "unavailable", pin };
}

/**
 * Arm public-key pinning for the connection about to be opened.
 *
 * Applies to sockets opened after this returns; one already open keeps the
 * trust it was opened with.
 *
 * **Throws rather than returning when a held pin cannot be honoured.** A pin
 * that is not checked is worth nothing, and a connection that proceeds anyway
 * looks exactly like one that verified — which is the failure most likely to be
 * mistaken for security. Refusing is the only outcome that cannot be misread.
 */
export function applyPinning(credential: AgentCredential | null, wsUrl: string): PinningState {
  const pin = credential?.publicKeyPin ?? "";
  const native = getNativeModule();

  if (!pin) {
    // Clearing matters: a previous connection may have left a pin armed, and
    // carrying it to an agent that serves no TLS would refuse a valid one.
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

  native.setPin(pin);
  return { status: "pinned", pin };
}
