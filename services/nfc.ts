import NfcManager, { NfcTech, Ndef, NfcEvents } from "react-native-nfc-manager";
import { Platform } from "react-native";
import { useAppStore } from "@/stores";
import { websocketService } from "./websocket";
import type { NDEFMessage, NDEFRecord, ScannedTag } from "@/types/protocol";

class NFCService {
  private static instance: NFCService;
  private isInitialized = false;

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

      return { supported, enabled };
    } catch (error) {
      console.error("[NFC] Initialization failed:", error);
      store.setNFCSupported(false);
      return { supported: false, enabled: false };
    }
  }

  async scanTag(): Promise<ScannedTag | null> {
    const store = useAppStore.getState();

    if (!this.isInitialized) {
      console.error("[NFC] Service not initialized");
      return null;
    }

    try {
      store.setScanning(true);

      // Request NFC technology
      await NfcManager.requestTechnology(NfcTech.Ndef);

      // Get the tag
      const tag = await NfcManager.getTag();

      if (!tag) {
        console.log("[NFC] No tag detected");
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

      const scannedTag: ScannedTag = {
        uid,
        technology,
        type,
        scannedAt: new Date(),
        ndefMessage,
        sentToServer: false,
      };

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

      return scannedTag;
    } catch (error) {
      console.error("[NFC] Scan failed:", error);
      throw error;
    } finally {
      store.setScanning(false);
      await this.cancelScan();
    }
  }

  async cancelScan(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (error) {
      // Ignore cancellation errors
    }

    useAppStore.getState().setScanning(false);
  }

  // iOS specific: invalidate session with message
  invalidateSession(message?: string): void {
    if (Platform.OS === "ios") {
      // On iOS, the session is automatically invalidated after reading
      // This is kept for potential future use with custom session handling
    }
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
