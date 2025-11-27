import { useEffect, useCallback, useState } from "react";
import { useAppStore } from "@/stores";
import { nfcService } from "@/services/nfc";

export function useNFC() {
  const nfc = useAppStore((state) => state.nfc);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize NFC on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const result = await nfcService.init();
        if (mounted) {
          setIsInitialized(true);
          if (!result.supported) {
            setInitError("NFC is not supported on this device");
          } else if (!result.enabled) {
            setInitError("NFC is disabled. Please enable it in settings.");
          }
        }
      } catch (error) {
        if (mounted) {
          setInitError(
            error instanceof Error ? error.message : "Failed to initialize NFC"
          );
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const startScan = useCallback(async () => {
    if (!isInitialized) {
      throw new Error("NFC not initialized");
    }

    if (!nfc.isSupported) {
      throw new Error("NFC not supported");
    }

    if (!nfc.isEnabled) {
      throw new Error("NFC is disabled");
    }

    try {
      const tag = await nfcService.scanTag();
      return tag;
    } catch (error) {
      console.error("[useNFC] Scan error:", error);
      throw error;
    }
  }, [isInitialized, nfc.isSupported, nfc.isEnabled]);

  const stopScan = useCallback(async () => {
    await nfcService.cancelScan();
  }, []);

  const checkEnabled = useCallback(async () => {
    return await nfcService.checkEnabled();
  }, []);

  return {
    // State
    isSupported: nfc.isSupported,
    isEnabled: nfc.isEnabled,
    isScanning: nfc.isScanning,
    isInitialized,
    initError,

    // Tag data
    lastTag: nfc.lastTag,
    scanHistory: nfc.scanHistory,

    // Actions
    startScan,
    stopScan,
    checkEnabled,
    clearHistory: useAppStore.getState().clearScanHistory,
  };
}
