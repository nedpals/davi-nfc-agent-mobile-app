/* eslint-env jest */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
  getStringAsync: jest.fn(() => Promise.resolve("")),
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("expo-device", () => ({
  deviceName: "Test Phone",
  modelName: "Test Model",
  modelId: "test-model",
  osName: "Android",
  osVersion: "14",
}));

// The NFC manager is native; the parts the app touches are stubbed, and the
// NDEF decoders are implemented well enough for the parsing tests to mean
// something.
jest.mock("react-native-nfc-manager", () => {
  const decodeText = (bytes) => {
    const arr = Array.from(bytes);
    const languageLength = arr[0] & 0x3f;
    return String.fromCharCode(...arr.slice(1 + languageLength));
  };

  const URI_PREFIXES = ["", "http://www.", "https://www.", "http://", "https://"];
  const decodeUri = (bytes) => {
    const arr = Array.from(bytes);
    return (URI_PREFIXES[arr[0]] ?? "") + String.fromCharCode(...arr.slice(1));
  };

  return {
    __esModule: true,
    default: {
      isSupported: jest.fn(() => Promise.resolve(true)),
      isEnabled: jest.fn(() => Promise.resolve(true)),
      start: jest.fn(() => Promise.resolve()),
      setEventListener: jest.fn(),
      registerTagEvent: jest.fn(() => Promise.resolve()),
      unregisterTagEvent: jest.fn(() => Promise.resolve()),
      goToNfcSetting: jest.fn(() => Promise.resolve()),
      requestTechnology: jest.fn(() => Promise.resolve()),
      cancelTechnologyRequest: jest.fn(() => Promise.resolve()),
      ndefHandler: {
        writeNdefMessage: jest.fn(() => Promise.resolve()),
        makeReadOnly: jest.fn(() => Promise.resolve()),
      },
      isoDepHandler: { transceive: jest.fn(() => Promise.resolve([0x90, 0x00])) },
      nfcAHandler: { transceive: jest.fn(() => Promise.resolve([0x0a, 0x0b])) },
    },
    Ndef: {
      TNF_EMPTY: 0,
      TNF_WELL_KNOWN: 1,
      TNF_MIME_MEDIA: 2,
      text: { decodePayload: jest.fn(decodeText) },
      uri: { decodePayload: jest.fn(decodeUri) },
      // The encoders keep enough shape to assert which record form was built;
      // the byte layout itself is the library's business, not the app's.
      textRecord: jest.fn((content, language) => ({ kind: "text", content, language })),
      uriRecord: jest.fn((uri) => ({ kind: "uri", uri })),
      record: jest.fn((tnf, type, id, payload) => ({ kind: "record", tnf, type, id, payload })),
      encodeMessage: jest.fn((records) => records.map((_, index) => index)),
    },
    NfcTech: { Ndef: "Ndef", NfcA: "NfcA", IsoDep: "IsoDep" },
    NfcEvents: { DiscoverTag: "NfcManagerDiscoverTag" },
    NfcAdapter: {
      FLAG_READER_NFC_A: 1,
      FLAG_READER_NFC_B: 2,
      FLAG_READER_NFC_F: 4,
      FLAG_READER_NFC_V: 8,
      FLAG_READER_NO_PLATFORM_SOUNDS: 256,
    },
  };
});

jest.mock("react-native-zeroconf", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    scan: jest.fn(),
    stop: jest.fn(),
    removeDeviceListeners: jest.fn(),
  })),
}));
