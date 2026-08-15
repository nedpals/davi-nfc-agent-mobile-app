import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { PinningStatus } from "@/services/pinning";
import type {
  ConnectionStatus,
  DiscoveredServer,
  ProtocolVersion,
  PairingSummary,
  ScannedTag,
  ServerInfo,
} from "@/types/protocol";
import { APP_VERSION, HISTORY_LIMIT, PERSISTED_HISTORY_LIMIT, getDeviceName } from "@/constants/config";

interface ConnectionState {
  status: ConnectionStatus;
  serverUrl: string | null;
  // The agent's API secret. It generates one on first run, so a device on the
  // LAN is rejected at the handshake without it.
  apiSecret: string | null;
  error: string | null;
  lastConnected: Date | null;
  serverInfo: ServerInfo | null;
  // What the agent agreed to speak: 1 after a hello handshake, 0 against an
  // agent that predates versioning.
  protocolVersion: ProtocolVersion;
  // What this device's own credential says, once it has one. The token itself
  // stays in the keychain and never enters the store.
  pairing: PairingSummary | null;
  // Whether the agent's key pin can actually be enforced by this build.
  // "unavailable" means a pin is held but cannot be checked, which is worth
  // showing rather than letting the connection read as verified.
  pinningState: PinningStatus;
  // Which retry is in flight, so "Reconnecting" can say how far along it is.
  reconnectAttempt: number;
  // Set when the user disconnected on purpose. Discovery re-arms itself
  // whenever the app is idle, and without this it would immediately reconnect
  // to the agent the user just left.
  manualDisconnect: boolean;
}

interface DeviceState {
  deviceId: string | null;
  deviceName: string;
  platform: "ios" | "android";
  appVersion: string;
  isRegistered: boolean;
}

interface NFCState {
  isSupported: boolean | null;
  isEnabled: boolean | null;
  // Whether NFC foreground dispatch is active (capturing NFC from the OS).
  isActive: boolean;
  // Whether to process incoming tags (user toggle).
  processingEnabled: boolean;
  lastTag: ScannedTag | null;
  scanHistory: ScannedTag[];
}

interface DiscoveryState {
  isSearching: boolean;
  discoveredServers: DiscoveredServer[];
  selectedServer: DiscoveredServer | null;
}

interface AppStore {
  connection: ConnectionState;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setServerUrl: (url: string | null) => void;
  setApiSecret: (secret: string | null) => void;
  setProtocolVersion: (version: ProtocolVersion) => void;
  setPairing: (pairing: PairingSummary | null) => void;
  setPinningState: (state: ConnectionState["pinningState"]) => void;
  setConnectionError: (error: string | null) => void;
  failConnection: (error: string) => void;
  setReconnectAttempt: (attempt: number) => void;
  setManualDisconnect: (manual: boolean) => void;
  setLastConnected: (date: Date | null) => void;
  setServerInfo: (info: ServerInfo | null) => void;

  device: DeviceState;
  setDeviceId: (id: string | null) => void;
  setDeviceName: (name: string) => void;
  setRegistered: (registered: boolean) => void;

  nfc: NFCState;
  setNFCSupported: (supported: boolean | null) => void;
  setNFCEnabled: (enabled: boolean | null) => void;
  setNFCActive: (active: boolean) => void;
  setProcessingEnabled: (enabled: boolean) => void;
  setLastTag: (tag: ScannedTag | null) => void;
  addScannedTag: (tag: ScannedTag) => void;
  markTagSent: (uid: string) => void;
  clearScanHistory: () => void;

  discovery: DiscoveryState;
  setSearching: (searching: boolean) => void;
  setDiscoveredServers: (servers: DiscoveredServer[]) => void;
  addDiscoveredServer: (server: DiscoveredServer) => void;
  removeDiscoveredServer: (name: string) => void;
  selectServer: (server: DiscoveredServer | null) => void;
  clearDiscoveredServers: () => void;

  reset: () => void;
  disconnect: () => void;
}

const getPlatform = (): "ios" | "android" => (Platform.OS === "ios" ? "ios" : "android");

const initialConnectionState: ConnectionState = {
  status: "disconnected",
  serverUrl: null,
  apiSecret: null,
  error: null,
  lastConnected: null,
  serverInfo: null,
  protocolVersion: 0,
  pairing: null,
  pinningState: "not-applicable",
  reconnectAttempt: 0,
  manualDisconnect: false,
};

const initialDeviceState: DeviceState = {
  deviceId: null,
  deviceName: getDeviceName(),
  platform: getPlatform(),
  appVersion: APP_VERSION,
  isRegistered: false,
};

const initialNFCState: NFCState = {
  isSupported: null,
  isEnabled: null,
  isActive: false,
  processingEnabled: true,
  lastTag: null,
  scanHistory: [],
};

const initialDiscoveryState: DiscoveryState = {
  isSearching: false,
  discoveredServers: [],
  selectedServer: null,
};

export const STORAGE_NAME = "davi-nfc-scanner-storage";

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => {
      const patchConnection = (partial: Partial<ConnectionState>) =>
        set((state) => ({ connection: { ...state.connection, ...partial } }));
      const patchDevice = (partial: Partial<DeviceState>) =>
        set((state) => ({ device: { ...state.device, ...partial } }));
      const patchNFC = (partial: Partial<NFCState>) =>
        set((state) => ({ nfc: { ...state.nfc, ...partial } }));
      const patchDiscovery = (partial: Partial<DiscoveryState>) =>
        set((state) => ({ discovery: { ...state.discovery, ...partial } }));

      return {
        connection: initialConnectionState,
        setConnectionStatus: (status) => patchConnection({ status }),
        setServerUrl: (serverUrl) => patchConnection({ serverUrl }),
        setApiSecret: (apiSecret) => patchConnection({ apiSecret }),
        setProtocolVersion: (protocolVersion) => patchConnection({ protocolVersion }),
        setPairing: (pairing) => patchConnection({ pairing }),
        setPinningState: (pinningState) => patchConnection({ pinningState }),
        // Recording an error is kept separate from entering the error state:
        // an error frame can arrive on a socket that is still up and still
        // registered, and flipping the status there loses the live connection.
        setConnectionError: (error) => patchConnection({ error }),
        failConnection: (error) => patchConnection({ error, status: "error" }),
        setReconnectAttempt: (reconnectAttempt) => patchConnection({ reconnectAttempt }),
        setManualDisconnect: (manualDisconnect) => patchConnection({ manualDisconnect }),
        setLastConnected: (lastConnected) => patchConnection({ lastConnected }),
        setServerInfo: (serverInfo) => patchConnection({ serverInfo }),

        device: initialDeviceState,
        setDeviceId: (deviceId) => patchDevice({ deviceId }),
        setDeviceName: (deviceName) => patchDevice({ deviceName }),
        setRegistered: (isRegistered) => patchDevice({ isRegistered }),

        nfc: initialNFCState,
        setNFCSupported: (isSupported) => patchNFC({ isSupported }),
        setNFCEnabled: (isEnabled) => patchNFC({ isEnabled }),
        setNFCActive: (isActive) => patchNFC({ isActive }),
        setProcessingEnabled: (processingEnabled) => patchNFC({ processingEnabled }),
        setLastTag: (lastTag) => patchNFC({ lastTag }),
        addScannedTag: (tag) =>
          set((state) => ({
            nfc: {
              ...state.nfc,
              lastTag: tag,
              scanHistory: [tag, ...state.nfc.scanHistory].slice(0, HISTORY_LIMIT),
            },
          })),
        // Only the newest scan of that UID is the one that was just sent;
        // marking every historical read of the same tag would backdate scans
        // the agent never saw.
        markTagSent: (uid) =>
          set((state) => {
            const index = state.nfc.scanHistory.findIndex((tag) => tag.uid === uid);
            const scanHistory =
              index === -1
                ? state.nfc.scanHistory
                : state.nfc.scanHistory.map((tag, i) =>
                    i === index ? { ...tag, sentToServer: true } : tag
                  );

            return {
              nfc: {
                ...state.nfc,
                lastTag:
                  state.nfc.lastTag?.uid === uid
                    ? { ...state.nfc.lastTag, sentToServer: true }
                    : state.nfc.lastTag,
                scanHistory,
              },
            };
          }),
        clearScanHistory: () => patchNFC({ scanHistory: [], lastTag: null }),

        discovery: initialDiscoveryState,
        setSearching: (isSearching) => patchDiscovery({ isSearching }),
        setDiscoveredServers: (discoveredServers) => patchDiscovery({ discoveredServers }),
        addDiscoveredServer: (server) =>
          set((state) => {
            const existing = state.discovery.discoveredServers.findIndex(
              (s) => s.name === server.name
            );
            const discoveredServers =
              existing >= 0
                ? state.discovery.discoveredServers.map((s, i) => (i === existing ? server : s))
                : [...state.discovery.discoveredServers, server];

            return { discovery: { ...state.discovery, discoveredServers } };
          }),
        removeDiscoveredServer: (name) =>
          set((state) => ({
            discovery: {
              ...state.discovery,
              discoveredServers: state.discovery.discoveredServers.filter((s) => s.name !== name),
              selectedServer:
                state.discovery.selectedServer?.name === name
                  ? null
                  : state.discovery.selectedServer,
            },
          })),
        selectServer: (selectedServer) => patchDiscovery({ selectedServer }),
        clearDiscoveredServers: () => patchDiscovery({ discoveredServers: [], selectedServer: null }),

        reset: () =>
          set({
            connection: initialConnectionState,
            device: { ...initialDeviceState, deviceName: get().device.deviceName },
            nfc: initialNFCState,
            discovery: initialDiscoveryState,
          }),
        // Pairing and pin enforcement outlive the socket: they describe the
        // credential this device holds, not the connection that just ended.
        disconnect: () =>
          set((state) => ({
            connection: {
              ...initialConnectionState,
              serverUrl: state.connection.serverUrl,
              apiSecret: state.connection.apiSecret,
              lastConnected: state.connection.lastConnected,
              pairing: state.connection.pairing,
              pinningState: state.connection.pinningState,
              manualDisconnect: true,
            },
            device: { ...state.device, deviceId: null, isRegistered: false },
          })),
      };
    },
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        connection: {
          serverUrl: state.connection.serverUrl,
          apiSecret: state.connection.apiSecret,
          lastConnected: state.connection.lastConnected,
        },
        device: {
          deviceName: state.device.deviceName,
        },
        nfc: {
          scanHistory: state.nfc.scanHistory.slice(0, PERSISTED_HISTORY_LIMIT),
        },
      }),
      // Zustand's default merge is shallow, so a partialized slice would
      // replace the whole slice and leave every field it omits undefined.
      // Each slice is merged onto its defaults instead, and the fields that
      // describe a live session are pinned back to their initial values rather
      // than restored from disk.
      merge: (persisted, current) => mergePersisted(persisted, current),
    }
  )
);

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

// JSON has no date type, so anything that went through storage comes back as a
// string and would fail the `Date` contract the rest of the app relies on.
const reviveTag = (value: unknown): ScannedTag | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const tag = value as Partial<ScannedTag>;
  const scannedAt = toDate(tag.scannedAt);
  if (typeof tag.uid !== "string" || !scannedAt) {
    return null;
  }

  return {
    uid: tag.uid,
    technology: tag.technology ?? "Unknown",
    type: tag.type ?? "Unknown",
    scannedAt,
    ndefMessage: tag.ndefMessage,
    sentToServer: tag.sentToServer === true,
  };
};

export function mergePersisted(persisted: unknown, current: AppStore): AppStore {
  const saved = (persisted ?? {}) as {
    connection?: Partial<ConnectionState>;
    device?: Partial<DeviceState>;
    nfc?: Partial<NFCState>;
  };

  const scanHistory = Array.isArray(saved.nfc?.scanHistory)
    ? saved.nfc.scanHistory.map(reviveTag).filter((tag): tag is ScannedTag => tag !== null)
    : [];

  return {
    ...current,
    connection: {
      ...current.connection,
      serverUrl: saved.connection?.serverUrl ?? null,
      apiSecret: saved.connection?.apiSecret ?? null,
      lastConnected: toDate(saved.connection?.lastConnected),
      status: "disconnected",
      error: null,
      serverInfo: null,
      protocolVersion: 0,
      reconnectAttempt: 0,
      manualDisconnect: false,
    },
    device: {
      ...current.device,
      deviceName: saved.device?.deviceName || current.device.deviceName,
      platform: getPlatform(),
      appVersion: APP_VERSION,
      deviceId: null,
      isRegistered: false,
    },
    nfc: {
      ...current.nfc,
      scanHistory,
      lastTag: null,
      isActive: false,
      processingEnabled: true,
    },
    discovery: { ...initialDiscoveryState },
  };
}
