import * as Device from "expo-device";
import { Platform } from "react-native";

// App configuration constants

export const APP_VERSION = "1.0.0";

// WebSocket configuration
export const WS_CONFIG = {
  // Default WebSocket path
  DEFAULT_PATH: "/ws",

  // The agent's default port. It serves devices and clients on this one port,
  // told apart by the mode=device discriminator.
  DEFAULT_PORT: 9470,

  // The CA bootstrap server, which is separate and always plain HTTP.
  BOOTSTRAP_PORT: 9472,

  // Heartbeat interval in milliseconds (10 seconds per protocol)
  HEARTBEAT_INTERVAL: 10000,

  // Request timeout in milliseconds
  REQUEST_TIMEOUT: 10000,

  // Reconnection settings
  RECONNECT: {
    INITIAL_DELAY: 1000,
    MAX_DELAY: 30000,
    MAX_ATTEMPTS: 10,
    BACKOFF_MULTIPLIER: 2,
  },
};

// NFC configuration
export const NFC_CONFIG = {
  // Technologies to scan for
  DEFAULT_TECH: "Ndef",
};

// mDNS discovery configuration
export const DISCOVERY_CONFIG = {
  // The agent advertises itself as _nfc-device._tcp, on the one port that
  // serves both devices and clients.
  SERVICE_TYPE: "nfc-device",
  PROTOCOL: "tcp",
  DOMAIN: "local.",

  // Discovery timeout in milliseconds
  TIMEOUT: 30000,
};

// Storage keys for AsyncStorage
export const STORAGE_KEYS = {
  SERVER_URL: "@davi_nfc_scanner/server_url",
  DEVICE_NAME: "@davi_nfc_scanner/device_name",
  SCAN_HISTORY: "@davi_nfc_scanner/scan_history",
};

// Get the real device name, with fallback
export const getDeviceName = (): string => {
  // Device.deviceName returns the user-assigned device name
  // e.g., "John's iPhone" or "Pixel 6 Pro"
  if (Device.deviceName) {
    return Device.deviceName;
  }

  // Fallback to model name if device name not available
  // e.g., "iPhone 14 Pro" or "Pixel 6"
  if (Device.modelName) {
    return Device.modelName;
  }

  // Final fallback based on platform
  return Device.osName === "iOS" ? "iPhone" : "Android Device";
};

// Get device metadata for registration
export const getDeviceMetadata = () => ({
  osVersion: `${Device.osName} ${Device.osVersion}`,
  model: Device.modelId || Device.modelName || "Unknown",
});

/**
 * What this device can actually do, which is not the same on both platforms.
 *
 * The agent acts on what is declared here, so everything is reported as it is:
 * the app reads NDEF and nothing else, and CoreNFC cannot reach MIFARE Classic
 * at all where Android's reader mode can.
 */
export const getDeviceCapabilities = () => {
  const isIOS = Platform.OS === "ios";

  return {
    canRead: true,
    // No write path exists in the app yet, so writing is not offered.
    canWrite: false,
    nfcType: isIOS ? "corenfc" : "isodep",

    // Neither APDU nor framing-level exchange is implemented.
    canTransceive: false,
    canTransceiveRaw: false,
    canLock: false,

    deviceType: "smartphone",
    supportedTagTypes: isIOS
      ? ["NTAG", "MIFARE Ultralight", "ISO-DEP"]
      : ["NTAG", "MIFARE Ultralight", "MIFARE Classic", "ISO-DEP"],
  };
};
