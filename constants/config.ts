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

// How long CoreNFC keeps a tag connected once a session reaches it. The limit
// is Apple's, is roughly twenty seconds, and cannot be renewed — restartPolling
// stopped extending sessions from iPhone 15 onward. Declared a little under the
// measured limit so the agent's own margin is not the only one.
export const IOS_TAG_HOLD_MS = 18_000;

// How long mDNS is given to answer before the app falls back to the address it
// already knows. Discovery resolves in well under this on a network that
// carries it, and never will on one that does not.
export const STORED_ADDRESS_GRACE = 4000;

// How many scans the app keeps, and how many of those survive a restart.
export const HISTORY_LIMIT = 50;
export const PERSISTED_HISTORY_LIMIT = 20;

// Reader mode re-reads a tag that stays in the field, so the same UID arriving
// again inside this window is the same presentation rather than a new scan.
export const TAG_DEDUPE_WINDOW = 2000;

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
    // Android only. Writing needs a technology session over a tag already in
    // the field, which reader mode provides; CoreNFC sessions are user-initiated
    // and modal, so an agent-driven write cannot complete without the person
    // presenting the tag to a system sheet.
    canWrite: !isIOS,
    nfcType: isIOS ? "corenfc" : "isodep",

    // Both exchange levels ride on the same session a write uses, so they
    // follow the same platform line.
    canTransceive: !isIOS,
    canTransceiveRaw: !isIOS,
    // Locking rides on the same session a write uses.
    canLock: !isIOS,

    deviceType: "smartphone",
    supportedTagTypes: isIOS
      ? ["NTAG", "MIFARE Ultralight", "ISO-DEP"]
      : ["NTAG", "MIFARE Ultralight", "MIFARE Classic", "ISO-DEP"],

    // Android's reader mode keeps a tag available for as long as it sits in the
    // field, so the hold is open-ended and the field is omitted. CoreNFC
    // connects a tag for about twenty seconds and cannot renew that, so an
    // agent has that long to get its work done.
    ...(isIOS ? { maxHoldMs: IOS_TAG_HOLD_MS } : {}),
  };
};
