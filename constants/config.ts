import * as Device from "expo-device";

// App configuration constants

export const APP_VERSION = "1.0.0";

// WebSocket configuration
export const WS_CONFIG = {
  // Default WebSocket path
  DEFAULT_PATH: "/ws",

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
  // Service type to discover
  SERVICE_TYPE: "nfc-agent",
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
