import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores";
import { nfcService } from "@/services/nfc";

export function useNFC() {
  const nfc = useAppStore((state) => state.nfc);
  const clearHistory = useAppStore((state) => state.clearScanHistory);
  const clearOperation = useAppStore((state) => state.clearTagOperation);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const result = await nfcService.init();
        if (!mounted) {
          return;
        }

        setIsInitialized(true);

        // Whether NFC is supported or switched on is already in the store, and
        // the UI reads it from there; only a genuine failure to start the
        // reader belongs here.
        if (result.supported && result.enabled) {
          await nfcService.enableForegroundDispatch();
        }
      } catch (error) {
        if (mounted) {
          setInitError(error instanceof Error ? error.message : "Failed to start NFC");
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleProcessing = useCallback(() => nfcService.toggleProcessing(), []);
  const enableProcessing = useCallback(() => nfcService.setProcessingEnabled(true), []);
  const disableProcessing = useCallback(() => nfcService.setProcessingEnabled(false), []);
  const checkEnabled = useCallback(() => nfcService.checkEnabled(), []);
  const clearLastTag = useCallback(() => nfcService.clearLastTag(), []);
  const openSystemSettings = useCallback(() => nfcService.openSystemSettings(), []);

  return {
    isSupported: nfc.isSupported,
    isEnabled: nfc.isEnabled,
    isActive: nfc.isActive,
    processingEnabled: nfc.processingEnabled,
    isInitialized,
    initError,

    lastTag: nfc.lastTag,
    scanHistory: nfc.scanHistory,
    operation: nfc.operation,

    toggleProcessing,
    enableProcessing,
    disableProcessing,
    checkEnabled,
    clearLastTag,
    clearHistory,
    clearOperation,
    openSystemSettings,
    canOpenSystemSettings: nfcService.canOpenSystemSettings(),
  };
}
