import { useAppStore } from "@/stores";
import type { NDEFMessage, NDEFRecord, ScannedTag } from "@/types/protocol";
import { AppState, type AppStateStatus, Platform } from "react-native";
import NfcManager, { Ndef, NfcAdapter, NfcEvents } from "react-native-nfc-manager";
import { websocketService } from "./websocket";

class NFCService {
  private static instance: NFCService;
  private isInitialized = false;
  private isForegroundActive = false;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private onTagDiscovered: ((tag: ScannedTag) => void) | null = null;

  private constructor() {}

  static getInstance(): NFCService {
    if (!NFCService.instance) {
      NFCService.instance = new NFCService();
    }
    return NFCService.instance;
  }

  async init(): Promise<{ supported: boolean; enabled: boolean }> {
    if (this.isInitialized) {
      const enabled = await NfcManager.isEnabled();
      return {
        supported: true,
        enabled,
      };
    }

    const store = useAppStore.getState();

    try {
      const supported = await NfcManager.isSupported();
      store.setNFCSupported(supported);

      if (!supported) {
        return { supported: false, enabled: false };
      }

      await NfcManager.start();
      this.isInitialized = true;

      const enabled = await NfcManager.isEnabled();
      store.setNFCEnabled(enabled);

      // Set up app state listener to manage NFC when app goes to background/foreground
      this.setupAppStateListener();

      return { supported, enabled };
    } catch (error) {
      console.error("[NFC] Initialization failed:", error);
      store.setNFCSupported(false);
      return { supported: false, enabled: false };
    }
  }

  private setupAppStateListener(): void {
    if (this.appStateSubscription) {
      return;
    }

    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppStateChange.bind(this)
    );
  }

  private async handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    if (nextAppState === "active") {
      console.log("[NFC] App became active");
      // Re-enable foreground dispatch when app becomes active
      if (!this.isForegroundActive) {
        // Small delay to ensure clean state
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!this.isForegroundActive) {
          await this.enableForegroundDispatch();
        }
      }
    } else if (nextAppState === "background") {
      console.log("[NFC] App going to background");
      // Disable foreground dispatch when going to background
      await this.disableForegroundDispatch();
    }
    // Don't react to "inactive" - it's a transitional state
  }

  async enableForegroundDispatch(): Promise<void> {
    if (!this.isInitialized) {
      console.error("[NFC] Service not initialized");
      return;
    }

    if (this.isForegroundActive) {
      console.log("[NFC] Foreground dispatch already active");
      return;
    }

    const store = useAppStore.getState();

    try {
      console.log("[NFC] Enabling foreground dispatch with reader mode");

      // Set up the tag discovery event listener
      NfcManager.setEventListener(NfcEvents.DiscoverTag, this.handleDiscoveredTag.bind(this));

      // Register for tag events with reader mode enabled for continuous scanning
      // This enables Android's ReaderMode which takes over NFC from the OS
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
      console.log("[NFC] Foreground dispatch enabled - ready to scan tags");
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

    const store = useAppStore.getState();

    console.log("[NFC] Disabling foreground dispatch");

    this.isForegroundActive = false;

    try {
      // Remove event listener
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      // Unregister tag event
      await NfcManager.unregisterTagEvent();
    } catch {
      // Ignore - might not be registered
    }

    store.setNFCActive(false);
    console.log("[NFC] Foreground dispatch disabled");
  }

  private async handleDiscoveredTag(tag: any): Promise<void> {
    const tagId = tag?.id;
    console.log("[NFC] Tag discovered:", tagId);

    const store = useAppStore.getState();

    // Check if processing is enabled (user toggle)
    if (!store.nfc.processingEnabled) {
      console.log("[NFC] Processing disabled, ignoring tag data");
      return;
    }

    try {
      const scannedTag = this.processTag(tag);

      if (scannedTag) {
        // Add to store
        store.addScannedTag(scannedTag);

        // Send to server if connected
        if (websocketService.isRegistered()) {
          websocketService.sendTagScanned({
            uid: scannedTag.uid,
            technology: scannedTag.technology,
            type: scannedTag.type,
            scannedAt: scannedTag.scannedAt.toISOString(),
            ndefMessage: scannedTag.ndefMessage,
          });
        }

        // Notify callback if set
        if (this.onTagDiscovered) {
          this.onTagDiscovered(scannedTag);
        }
      }
    } catch (error) {
      console.error("[NFC] Error processing discovered tag:", error);
    }
  }

  // Call this method to clear the last scanned tag (e.g., via a button)
  clearLastTag(): void {
    console.log("[NFC] Clearing last tag");
    const store = useAppStore.getState();
    const lastTag = store.nfc.lastTag;

    // Notify server that tag is no longer present
    if (lastTag && websocketService.isRegistered()) {
      websocketService.sendTagRemoved(lastTag.uid);
    }

    store.setLastTag(null);
  }

  private processTag(tag: any): ScannedTag | null {
    if (!tag) {
      console.log("[NFC] No tag data");
      return null;
    }

    // Format UID
    const uid = this.formatUID(tag.id);

    // Determine technology
    const technology = this.getTechnology(tag);

    // Get tag type
    const type = this.getTagType(tag);

    // Parse NDEF message if available
    const ndefMessage = this.parseNDEFMessage(tag.ndefMessage);

    return {
      uid,
      technology,
      type,
      scannedAt: new Date(),
      ndefMessage,
      sentToServer: false,
    };
  }

  setTagDiscoveredCallback(callback: ((tag: ScannedTag) => void) | null): void {
    this.onTagDiscovered = callback;
  }

  isForegroundDispatchActive(): boolean {
    return this.isForegroundActive;
  }

  toggleProcessing(): boolean {
    const store = useAppStore.getState();
    const newValue = !store.nfc.processingEnabled;
    store.setProcessingEnabled(newValue);
    console.log("[NFC] Processing", newValue ? "enabled" : "disabled");
    return newValue;
  }

  setProcessingEnabled(enabled: boolean): void {
    useAppStore.getState().setProcessingEnabled(enabled);
    console.log("[NFC] Processing", enabled ? "enabled" : "disabled");
  }

  private formatUID(id: string | number[] | undefined): string {
    if (!id) {
      return "UNKNOWN";
    }

    if (typeof id === "string") {
      // Already a string, normalize to uppercase colon-separated
      return id
        .replace(/[^0-9a-fA-F]/g, "")
        .toUpperCase()
        .match(/.{1,2}/g)
        ?.join(":") || id.toUpperCase();
    }

    // Array of bytes
    return id.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(":");
  }

  private getTechnology(tag: any): string {
    // Android provides techTypes array
    if (tag.techTypes && Array.isArray(tag.techTypes)) {
      if (tag.techTypes.includes("android.nfc.tech.IsoDep")) {
        return "ISO14443A";
      }
      if (tag.techTypes.includes("android.nfc.tech.NfcA")) {
        return "ISO14443A";
      }
      if (tag.techTypes.includes("android.nfc.tech.NfcB")) {
        return "ISO14443B";
      }
      if (tag.techTypes.includes("android.nfc.tech.NfcV")) {
        return "ISO15693";
      }
      if (tag.techTypes.includes("android.nfc.tech.NfcF")) {
        return "ISO18092";
      }
    }

    // iOS typically uses ISO14443A
    if (Platform.OS === "ios") {
      return "ISO14443A";
    }

    return "Unknown";
  }

  private getTagType(tag: any): string {
    // Try to determine tag type from various properties
    if (tag.type) {
      if (tag.type === "com.nxp.ndef.mifareclassic") {
        return "MIFARE Classic";
      }

      return tag.type;
    }

    // Android specific
    if (tag.techTypes && Array.isArray(tag.techTypes)) {
      if (tag.techTypes.includes("android.nfc.tech.MifareClassic")) {
        return "MIFARE Classic";
      }
      if (tag.techTypes.includes("android.nfc.tech.MifareUltralight")) {
        return "MIFARE Ultralight";
      }
      if (tag.techTypes.includes("android.nfc.tech.IsoDep")) {
        return "ISO-DEP";
      }
    }

    // Check NDEF type
    if (tag.ndefMessage) {
      return "NDEF";
    }

    return "Unknown";
  }

  private parseNDEFMessage(ndefMessage: any): NDEFMessage | undefined {
    if (!ndefMessage || !Array.isArray(ndefMessage)) {
      return undefined;
    }

    const records: NDEFRecord[] = ndefMessage.map((record: any) => {
      const baseRecord: NDEFRecord = {
        tnf: record.tnf ?? 0,
        type: this.bytesToBase64(record.type),
        payload: this.bytesToBase64(record.payload),
      };

      // Try to decode text records
      if (record.tnf === Ndef.TNF_WELL_KNOWN) {
        try {
          const typeStr = this.bytesToString(record.type);
          if (typeStr === "T") {
            // Text record
            const decoded = Ndef.text.decodePayload(
              record.payload instanceof Uint8Array
                ? record.payload
                : new Uint8Array(record.payload)
            );
            if (decoded) {
              baseRecord.recordType = "text";
              baseRecord.content = decoded;
              baseRecord.language = "en"; // Ndef.text.decodePayload doesn't return language
            }
          } else if (typeStr === "U") {
            // URI record
            const decoded = Ndef.uri.decodePayload(
              record.payload instanceof Uint8Array
                ? record.payload
                : new Uint8Array(record.payload)
            );
            if (decoded) {
              baseRecord.recordType = "uri";
              baseRecord.content = decoded;
            }
          }
        } catch (error) {
          // Ignore decode errors
        }
      }

      return baseRecord;
    });

    return { records };
  }

  private bytesToBase64(bytes: number[] | Uint8Array | undefined): string {
    if (!bytes) {
      return "";
    }

    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = "";
    for (let i = 0; i < arr.length; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
  }

  private bytesToString(bytes: number[] | Uint8Array | undefined): string {
    if (!bytes) {
      return "";
    }

    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return String.fromCharCode(...arr);
  }

  async checkEnabled(): Promise<boolean> {
    try {
      const enabled = await NfcManager.isEnabled();
      useAppStore.getState().setNFCEnabled(enabled);
      return enabled;
    } catch {
      return false;
    }
  }
}

export const nfcService = NFCService.getInstance();
