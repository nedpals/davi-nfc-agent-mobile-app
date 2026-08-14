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
}

export default requireNativeModule<AgentPinningModule>("AgentPinning");
