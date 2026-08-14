import { Platform } from "react-native";
import { Ndef } from "react-native-nfc-manager";
import type { NDEFMessage, NDEFRecord, ScannedTag } from "@/types/protocol";

// `react-native-nfc-manager` hands back record fields as a byte array on one
// platform and a string on the other, so both are accepted everywhere.
export type Bytes = number[] | Uint8Array | string | undefined;

export interface RawNdefRecord {
  tnf?: number;
  type?: Bytes;
  payload?: Bytes;
}

/** The shape `react-native-nfc-manager` hands back, which differs per platform. */
export interface RawNfcTag {
  id?: string | number[];
  techTypes?: string[];
  type?: string;
  ndefMessage?: RawNdefRecord[];
}

export function formatUID(id: string | number[] | undefined): string {
  if (!id) {
    return "UNKNOWN";
  }

  if (typeof id === "string") {
    const normalized = id.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    return normalized.match(/.{1,2}/g)?.join(":") || id.toUpperCase();
  }

  return id.map((byte) => (byte & 0xff).toString(16).toUpperCase().padStart(2, "0")).join(":");
}

export function getTechnology(tag: RawNfcTag): string {
  const techTypes = Array.isArray(tag.techTypes) ? tag.techTypes : [];

  if (techTypes.includes("android.nfc.tech.IsoDep") || techTypes.includes("android.nfc.tech.NfcA")) {
    return "ISO14443A";
  }
  if (techTypes.includes("android.nfc.tech.NfcB")) {
    return "ISO14443B";
  }
  if (techTypes.includes("android.nfc.tech.NfcV")) {
    return "ISO15693";
  }
  if (techTypes.includes("android.nfc.tech.NfcF")) {
    return "ISO18092";
  }

  // CoreNFC does not report the technology, and everything it will hand to a
  // reader session is 14443-A.
  if (Platform.OS === "ios") {
    return "ISO14443A";
  }

  return "Unknown";
}

export function getTagType(tag: RawNfcTag): string {
  const techTypes = Array.isArray(tag.techTypes) ? tag.techTypes : [];

  // Read from the technology list first: the NDEF type string describes the
  // formatting, and "com.nxp.ndef.mifareclassic" is the only one that also
  // names the chip.
  if (techTypes.includes("android.nfc.tech.MifareClassic")) {
    return "MIFARE Classic";
  }
  if (techTypes.includes("android.nfc.tech.MifareUltralight")) {
    return "MIFARE Ultralight";
  }

  if (tag.type) {
    return tag.type === "com.nxp.ndef.mifareclassic" ? "MIFARE Classic" : tag.type;
  }

  if (techTypes.includes("android.nfc.tech.IsoDep")) {
    return "ISO-DEP";
  }

  if (tag.ndefMessage) {
    return "NDEF";
  }

  return "Unknown";
}

export function bytesToBase64(bytes: Bytes): string {
  if (!bytes) {
    return "";
  }

  const arr = toUint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function bytesToString(bytes: Bytes): string {
  if (typeof bytes === "string") {
    return bytes;
  }
  return String.fromCharCode(...toUint8Array(bytes));
}

function toUint8Array(bytes: Bytes): Uint8Array {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (typeof bytes === "string") {
    return Uint8Array.from(bytes, (char) => char.charCodeAt(0) & 0xff);
  }
  return new Uint8Array(bytes ?? []);
}

// The first byte of a well-known text payload holds the encoding flag in its
// high bit and the language-code length in the low five, which is the only
// place the language is recorded.
function textRecordLanguage(payload: Bytes): string | undefined {
  const arr = toUint8Array(payload);
  const length = arr.length ? arr[0] & 0x3f : 0;
  if (!length || arr.length < length + 1) {
    return undefined;
  }
  return String.fromCharCode(...arr.subarray(1, length + 1));
}

export function parseNDEFMessage(ndefMessage: RawNdefRecord[] | undefined): NDEFMessage | undefined {
  if (!ndefMessage || !Array.isArray(ndefMessage)) {
    return undefined;
  }

  const records: NDEFRecord[] = ndefMessage.map((record) => {
    const parsed: NDEFRecord = {
      tnf: record.tnf ?? 0,
      type: bytesToBase64(record.type),
      payload: bytesToBase64(record.payload),
    };

    if (record.tnf === Ndef.TNF_WELL_KNOWN) {
      try {
        const typeStr = bytesToString(record.type);
        if (typeStr === "T") {
          const decoded = Ndef.text.decodePayload(toUint8Array(record.payload));
          if (decoded) {
            parsed.recordType = "text";
            parsed.content = decoded;
            parsed.language = textRecordLanguage(record.payload);
          }
        } else if (typeStr === "U") {
          const decoded = Ndef.uri.decodePayload(toUint8Array(record.payload));
          if (decoded) {
            parsed.recordType = "uri";
            parsed.content = decoded;
          }
        }
      } catch {
        // A record that will not decode still travels as its raw payload.
      }
    }

    return parsed;
  });

  return { records };
}

export function processTag(tag: RawNfcTag | null | undefined): ScannedTag | null {
  if (!tag) {
    return null;
  }

  return {
    uid: formatUID(tag.id),
    technology: getTechnology(tag),
    type: getTagType(tag),
    scannedAt: new Date(),
    ndefMessage: parseNDEFMessage(tag.ndefMessage),
    sentToServer: false,
  };
}
