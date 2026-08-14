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

export type PinningState =
  | { status: "pinned"; pin: string }
  // The agent serves no TLS, so there is no key to pin and nothing to verify.
  | { status: "not-applicable" }
  // A pin is held but cannot be enforced by this build. The connection will
  // still be made, and it is not verified — callers should say so rather than
  // let it read as secure.
  | { status: "unavailable"; pin: string };

/**
 * Arm public-key pinning for the connection about to be opened.
 *
 * Applies to sockets opened after this returns; one already open keeps the
 * trust it was opened with.
 */
export function applyPinning(credential: AgentCredential | null): PinningState {
  const pin = credential?.publicKeyPin ?? "";
  const native = getNativeModule();

  if (!pin) {
    native?.setPin(null);
    return { status: "not-applicable" };
  }

  if (!native?.isSupported) {
    return { status: "unavailable", pin };
  }

  native.setPin(pin);
  return { status: "pinned", pin };
}
