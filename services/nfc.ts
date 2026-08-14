import { TAG_DEDUPE_WINDOW } from "@/constants/config";
import { useAppStore } from "@/stores";
import type { ScannedTag } from "@/types/protocol";
import * as Haptics from "expo-haptics";
import { AppState, type AppStateStatus, Platform } from "react-native";
import NfcManager, { NfcAdapter, NfcEvents } from "react-native-nfc-manager";
import { processTag, type RawNfcTag } from "./nfc-parsing";
import { websocketService } from "./websocket";

export interface NFCInitResult {
  supported: boolean;
  enabled: boolean;
}

class NFCService {
  private static instance: NFCService;
  private isInitialized = false;
  private initPromise: Promise<NFCInitResult> | null = null;
  private isForegroundActive = false;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private onTagDiscovered: ((tag: ScannedTag) => void) | null = null;
  private lastAccepted: { uid: string; at: number } | null = null;

  private constructor() {}

  static getInstance(): NFCService {
    if (!NFCService.instance) {
      NFCService.instance = new NFCService();
    }
    return NFCService.instance;
  }

  /**
   * Both the root layout and the scanner screen ask for NFC on mount, so the
   * work is shared rather than repeated: starting the manager twice leaves the
   * second caller talking to a half-configured adapter.
   */
  async init(): Promise<NFCInitResult> {
    if (!this.initPromise) {
      this.initPromise = this.performInit();
    }
    return this.initPromise;
  }

  private async performInit(): Promise<NFCInitResult> {
    const store = useAppStore.getState();

    try {
      const supported = await NfcManager.isSupported();
      store.setNFCSupported(supported);

      if (!supported) {
        store.setNFCEnabled(false);
        return { supported: false, enabled: false };
      }

      await NfcManager.start();
      this.isInitialized = true;

      const enabled = await NfcManager.isEnabled();
      store.setNFCEnabled(enabled);

      this.setupAppStateListener();

      return { supported, enabled };
    } catch (error) {
      console.error("[NFC] Initialization failed:", error);
      store.setNFCSupported(false);
      store.setNFCEnabled(false);
      return { supported: false, enabled: false };
    }
  }

  private setupAppStateListener(): void {
    if (this.appStateSubscription) {
      return;
    }

    this.appStateSubscription = AppState.addEventListener("change", (next) => {
      this.handleAppStateChange(next).catch((error) =>
        console.error("[NFC] App state handling failed:", error)
      );
    });
  }

  private async handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    // "inactive" is transitional — a notification shade or the app switcher —
    // and tearing down the reader there costs a scan on the way back.
    if (nextAppState === "active") {
      // NFC may have been switched on in system settings while the app was
      // away, which nothing else would tell us about.
      const enabled = await this.checkEnabled();
      if (enabled && !this.isForegroundActive) {
        await this.enableForegroundDispatch();
      }
    } else if (nextAppState === "background") {
      await this.disableForegroundDispatch();
    }
  }

  async enableForegroundDispatch(): Promise<void> {
    if (!this.isInitialized) {
      console.error("[NFC] Service not initialized");
      return;
    }

    const store = useAppStore.getState();

    if (this.isForegroundActive) {
      // Re-assert it rather than returning silently: the reader is running, and
      // a store that says otherwise leaves the UI disabled with no way back.
      store.setNFCActive(true);
      return;
    }


    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, this.handleDiscoveredTag.bind(this));

      // Reader mode takes NFC away from the OS, so tags land here instead of
      // raising the system's own tag handler.
      await NfcManager.registerTagEvent({
        isReaderModeEnabled: true,
        readerModeFlags:
          NfcAdapter.FLAG_READER_NFC_A |
          NfcAdapter.FLAG_READER_NFC_B |
          NfcAdapter.FLAG_READER_NFC_F |
          NfcAdapter.FLAG_READER_NFC_V |
          NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
        readerModeDelay: 20,
      });

      this.isForegroundActive = true;
      store.setNFCActive(true);
      console.log("[NFC] Reader mode active");
    } catch (error) {
      console.error("[NFC] Failed to enable foreground dispatch:", error);
      this.isForegroundActive = false;
      store.setNFCActive(false);
      throw error;
    }
  }

  async disableForegroundDispatch(): Promise<void> {
    if (!this.isForegroundActive) {
      return;
    }

    this.isForegroundActive = false;

    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      await NfcManager.unregisterTagEvent();
    } catch {
      // Already unregistered, which is the state we wanted.
    }

    useAppStore.getState().setNFCActive(false);
  }

  private async handleDiscoveredTag(tag: RawNfcTag): Promise<void> {
    const store = useAppStore.getState();

    if (!store.nfc.processingEnabled) {
      return;
    }

    try {
      const scannedTag = processTag(tag);
      if (!scannedTag) {
        return;
      }

      // Reader mode keeps reporting a tag that stays in the field, and each
      // repeat would otherwise become its own scan and its own frame.
      if (this.isRepeatPresentation(scannedTag)) {
        return;
      }

      store.addScannedTag(scannedTag);
      this.notifyScan();

      if (websocketService.isRegistered()) {
        websocketService.sendTagScanned({
          uid: scannedTag.uid,
          technology: scannedTag.technology,
          type: scannedTag.type,
          scannedAt: scannedTag.scannedAt.toISOString(),
          ndefMessage: scannedTag.ndefMessage,
        });
      }

      this.onTagDiscovered?.(scannedTag);
    } catch (error) {
      console.error("[NFC] Error processing discovered tag:", error);
    }
  }

  private isRepeatPresentation(tag: ScannedTag): boolean {
    const now = tag.scannedAt.getTime();
    const previous = this.lastAccepted;
    this.lastAccepted = { uid: tag.uid, at: now };

    return previous?.uid === tag.uid && now - previous.at < TAG_DEDUPE_WINDOW;
  }

  private notifyScan(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Haptics are a nicety; a device without them still scans.
    });
  }

  clearLastTag(): void {
    const store = useAppStore.getState();
    const lastTag = store.nfc.lastTag;

    if (lastTag && websocketService.isRegistered()) {
      websocketService.sendTagRemoved(lastTag.uid);
    }

    // Dismissing the tag means the next read of it is a new presentation, not
    // the tail of the one just cleared.
    this.lastAccepted = null;
    store.setLastTag(null);
  }

  setTagDiscoveredCallback(callback: ((tag: ScannedTag) => void) | null): void {
    this.onTagDiscovered = callback;
  }

  isForegroundDispatchActive(): boolean {
    return this.isForegroundActive;
  }

  toggleProcessing(): boolean {
    const store = useAppStore.getState();
    const next = !store.nfc.processingEnabled;
    store.setProcessingEnabled(next);
    return next;
  }

  setProcessingEnabled(enabled: boolean): void {
    useAppStore.getState().setProcessingEnabled(enabled);
  }

  async checkEnabled(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      const enabled = await NfcManager.isEnabled();
      useAppStore.getState().setNFCEnabled(enabled);
      return enabled;
    } catch {
      return false;
    }
  }

  /** Android can send the user straight to the NFC toggle; iOS cannot. */
  canOpenSystemSettings(): boolean {
    return Platform.OS === "android";
  }

  async openSystemSettings(): Promise<void> {
    if (!this.canOpenSystemSettings()) {
      return;
    }

    try {
      await NfcManager.goToNfcSetting();
    } catch (error) {
      console.error("[NFC] Failed to open NFC settings:", error);
    }
  }
}

export const nfcService = NFCService.getInstance();
