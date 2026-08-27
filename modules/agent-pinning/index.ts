import { NativeModule, requireNativeModule } from "expo";

declare class AgentPinningModule extends NativeModule {
  /**
   * Pin every subsequent WebSocket connection to this agent's public key.
   *
   * `pin` is the `sha256/<base64>` value handed over at pairing, taken over the
   * certificate's SubjectPublicKeyInfo. Passing `null` returns the app to
   * ordinary chain validation.
   *
   * Applies to connections opened after the call — an already-open socket keeps
   * whatever trust it was opened with.
   */
  setPin(pin: string | null): void;

  /**
   * Whether this build can enforce a pin. False means the native module is
   * absent (Expo Go, or a build predating it), and a caller should refuse to
   * treat the connection as verified rather than assume it is.
   */
  readonly isSupported: boolean;

  /**
   * POST `body` as JSON to `url`, verifying the agent by `pin` rather than by a
   * certificate chain.
   *
   * Pairing needs this: it is the request that hands the pin over, so there is
   * nothing stored for `setPin` to arm, and React Native's `fetch` offers no
   * per-request trust hook. `pin` of `null` accepts whatever the agent presents
   * — a trust-on-first-use pairing, which the caller reports as unverified.
   *
   * Rejects when the key does not match, when nothing answers, or when the
   * answer is not HTTP. An HTTP error status resolves: it is the agent
   * answering, and what it says is the caller's to read.
   */
  postPinned(
    url: string,
    pin: string | null,
    body: string
  ): Promise<{ status: number; body: string }>;
}

export default requireNativeModule<AgentPinningModule>("AgentPinning");
