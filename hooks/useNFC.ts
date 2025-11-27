import { useEffect, useCallback, useState } from "react";
import { useAppStore } from "@/stores";
import { nfcService } from "@/services/nfc";

export function useNFC() {
  const nfc = useAppStore((state) => state.nfc);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize NFC on mount and auto-enable foreground dispatch
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
          } else {
            // Auto-enable foreground dispatch when app opens
            await nfcService.enableForegroundDispatch();
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

  // Toggle tag processing (NFC stays captured, just controls whether tags are processed)
  const toggleProcessing = useCallback(() => {
    nfcService.toggleProcessing();
  }, []);

  // Enable tag processing
  const enableProcessing = useCallback(() => {
    nfcService.setProcessingEnabled(true);
  }, []);

  // Disable tag processing
  const disableProcessing = useCallback(() => {
    nfcService.setProcessingEnabled(false);
  }, []);

  const checkEnabled = useCallback(async () => {
    return await nfcService.checkEnabled();
  }, []);

  return {
    // State
    isSupported: nfc.isSupported,
    isEnabled: nfc.isEnabled,
    isActive: nfc.isActive, // Whether NFC foreground dispatch is active
    processingEnabled: nfc.processingEnabled, // Whether tags are being processed
    tagPresent: nfc.tagPresent, // Whether a tag is currently on the reader
    isInitialized,
    initError,

    // Tag data
    lastTag: nfc.lastTag,
    scanHistory: nfc.scanHistory,

    // Actions
    toggleProcessing,
    enableProcessing,
    disableProcessing,
    checkEnabled,
    clearHistory: useAppStore.getState().clearScanHistory,
  };
}
