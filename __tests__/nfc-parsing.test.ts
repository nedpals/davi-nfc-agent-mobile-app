import { Platform } from "react-native";
import {
  bytesToBase64,
  bytesToString,
  formatUID,
  getTagType,
  getTechnology,
  parseNDEFMessage,
  processTag,
} from "@/services/nfc-parsing";

function withPlatform(os: "ios" | "android", assertion: () => void) {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  try {
    assertion();
  } finally {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  }
}

describe("formatUID", () => {
  it("formats a byte array as colon-separated hex", () => {
    expect(formatUID([0x04, 0xa2, 0x0b, 0x00])).toBe("04:A2:0B:00");
  });

  it("pads single-digit bytes", () => {
    expect(formatUID([1, 2])).toBe("01:02");
  });

  it("normalizes a string UID however it was punctuated", () => {
    expect(formatUID("04a20b00")).toBe("04:A2:0B:00");
    expect(formatUID("04-a2-0b-00")).toBe("04:A2:0B:00");
    expect(formatUID("04:A2:0B:00")).toBe("04:A2:0B:00");
  });

  it("names a missing UID rather than returning an empty string", () => {
    expect(formatUID(undefined)).toBe("UNKNOWN");
    expect(formatUID("")).toBe("UNKNOWN");
  });
});

describe("getTechnology", () => {
  it.each([
    [["android.nfc.tech.NfcA"], "ISO14443A"],
    [["android.nfc.tech.IsoDep", "android.nfc.tech.NfcA"], "ISO14443A"],
    [["android.nfc.tech.NfcB"], "ISO14443B"],
    [["android.nfc.tech.NfcV"], "ISO15693"],
    [["android.nfc.tech.NfcF"], "ISO18092"],
  ])("maps %s to %s", (techTypes, expected) => {
    expect(getTechnology({ techTypes })).toBe(expected);
  });

  it("reports Unknown on Android when nothing was advertised", () => {
    withPlatform("android", () => expect(getTechnology({})).toBe("Unknown"));
  });

  it("assumes 14443-A on iOS, which is all CoreNFC hands over", () => {
    withPlatform("ios", () => expect(getTechnology({})).toBe("ISO14443A"));
  });
});

describe("getTagType", () => {
  it("prefers the technology list over the NDEF formatting string", () => {
    expect(
      getTagType({ type: "org.nfcforum.ndef.type2", techTypes: ["android.nfc.tech.MifareClassic"] })
    ).toBe("MIFARE Classic");
  });

  it("recognises the NXP MIFARE Classic NDEF type", () => {
    expect(getTagType({ type: "com.nxp.ndef.mifareclassic" })).toBe("MIFARE Classic");
  });

  it("reads MIFARE Ultralight and ISO-DEP from the technology list", () => {
    expect(getTagType({ techTypes: ["android.nfc.tech.MifareUltralight"] })).toBe(
      "MIFARE Ultralight"
    );
    expect(getTagType({ techTypes: ["android.nfc.tech.IsoDep"] })).toBe("ISO-DEP");
  });

  it("falls back to NDEF then Unknown", () => {
    expect(getTagType({ ndefMessage: [] })).toBe("NDEF");
    expect(getTagType({})).toBe("Unknown");
  });
});

describe("byte helpers", () => {
  it("base64-encodes arrays, typed arrays and strings alike", () => {
    expect(bytesToBase64([0x68, 0x69])).toBe("aGk=");
    expect(bytesToBase64(new Uint8Array([0x68, 0x69]))).toBe("aGk=");
    expect(bytesToBase64("hi")).toBe("aGk=");
    expect(bytesToBase64(undefined)).toBe("");
  });

  it("reads a record type given either as bytes or as a string", () => {
    expect(bytesToString([0x54])).toBe("T");
    expect(bytesToString("T")).toBe("T");
    expect(bytesToString(undefined)).toBe("");
  });
});

describe("parseNDEFMessage", () => {
  const textPayload = [0x02, 0x65, 0x6e, ...Array.from("Hello", (c) => c.charCodeAt(0))];

  it("decodes a well-known text record and keeps its language", () => {
    const parsed = parseNDEFMessage([{ tnf: 1, type: [0x54], payload: textPayload }]);

    expect(parsed?.records[0]).toMatchObject({
      tnf: 1,
      recordType: "text",
      content: "Hello",
      language: "en",
    });
  });

  it("decodes a well-known URI record with its prefix", () => {
    const parsed = parseNDEFMessage([
      { tnf: 1, type: [0x55], payload: [0x04, ...Array.from("davi.dev", (c) => c.charCodeAt(0))] },
    ]);

    expect(parsed?.records[0]).toMatchObject({ recordType: "uri", content: "https://davi.dev" });
  });

  it("carries a record it cannot decode as its raw payload", () => {
    const parsed = parseNDEFMessage([{ tnf: 2, type: [0x01], payload: [0x01, 0x02] }]);

    expect(parsed?.records[0].recordType).toBeUndefined();
    expect(parsed?.records[0].payload).toBe(bytesToBase64([0x01, 0x02]));
  });

  it("returns nothing for a tag that carries no NDEF message", () => {
    expect(parseNDEFMessage(undefined)).toBeUndefined();
  });
});

describe("processTag", () => {
  it("builds a scan from a raw tag", () => {
    const tag = processTag({
      id: [0x04, 0xa2],
      techTypes: ["android.nfc.tech.NfcA", "android.nfc.tech.MifareUltralight"],
    });

    expect(tag).toMatchObject({
      uid: "04:A2",
      technology: "ISO14443A",
      type: "MIFARE Ultralight",
      sentToServer: false,
    });
    expect(tag?.scannedAt).toBeInstanceOf(Date);
  });

  it("returns null when there is no tag", () => {
    expect(processTag(null)).toBeNull();
    expect(processTag(undefined)).toBeNull();
  });
});
