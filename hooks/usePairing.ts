import { useCallback, useEffect, useState } from "react";
import { clearCredential, loadCredential, saveCredential } from "@/services/credentials";
import { type PairOptions, pairWithAgent } from "@/services/pairing";
import { describePinning } from "@/services/pinning";
import { useAppStore } from "@/stores";
import { toPairingSummary } from "@/types/protocol";

/**
 * The device's own credential: what it says, and how to get or drop one.
 *
 * The keychain is the source of truth. The store holds everything about the
 * credential except the token, so the UI never has to carry a bearer secret to
 * describe the pairing.
 */
export function usePairing() {
  const pairing = useAppStore((state) => state.connection.pairing);
  const pinningState = useAppStore((state) => state.connection.pinningState);
  const setPairing = useAppStore((state) => state.setPairing);
  const setPinningState = useAppStore((state) => state.setPinningState);
  const [isPairing, setIsPairing] = useState(false);

  const refresh = useCallback(async () => {
    const stored = await loadCredential();
    setPairing(stored ? toPairingSummary(stored) : null);
    // Reported here as well as armed at connect time, so Settings can say
    // whether the pin is enforceable before anything is dialled.
    setPinningState(describePinning(stored).status);
  }, [setPairing, setPinningState]);

  useEffect(() => {
    refresh().catch((error) => console.error("[Pairing] Failed to load credential:", error));
  }, [refresh]);

  const pair = useCallback(
    async (host: string, pin: string, deviceName: string, options: PairOptions) => {
      setIsPairing(true);
      try {
        const credential = await pairWithAgent(host, pin, deviceName, options);
        // The token comes back exactly once, so it is stored before anything
        // else can fail.
        await saveCredential(credential);
        setPairing(toPairingSummary(credential));
        setPinningState(describePinning(credential).status);
        return credential;
      } finally {
        setIsPairing(false);
      }
    },
    [setPairing, setPinningState]
  );

  const unpair = useCallback(async () => {
    await clearCredential();
    setPairing(null);
    setPinningState(describePinning(null).status);
  }, [setPairing, setPinningState]);

  return {
    pairing,
    isPaired: pairing !== null,
    pinningState,
    isPairing,
    pair,
    unpair,
    refresh,
  };
}
