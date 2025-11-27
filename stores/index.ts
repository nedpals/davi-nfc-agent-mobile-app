import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type {
  ConnectionStatus,
  DiscoveredServer,
  ScannedTag,
  ServerInfo,
} from "@/types/protocol";
import { APP_VERSION, getDeviceName } from "@/constants/config";

// Connection state slice
interface ConnectionState {
  status: ConnectionStatus;
  serverUrl: string | null;
  error: string | null;
  lastConnected: Date | null;
  serverInfo: ServerInfo | null;
}

// Device state slice
interface DeviceState {
  deviceId: string | null;
  deviceName: string;
  platform: "ios" | "android";
  appVersion: string;
  isRegistered: boolean;
}

// NFC state slice
interface NFCState {
  isSupported: boolean | null;
  isEnabled: boolean | null;
  isScanning: boolean;
  lastTag: ScannedTag | null;
  scanHistory: ScannedTag[];
}

// Discovery state slice
interface DiscoveryState {
  isSearching: boolean;
  discoveredServers: DiscoveredServer[];
  selectedServer: DiscoveredServer | null;
}

// Combined store interface
interface AppStore {
  // Connection slice
  connection: ConnectionState;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setServerUrl: (url: string | null) => void;
  setConnectionError: (error: string | null) => void;
  setLastConnected: (date: Date | null) => void;
  setServerInfo: (info: ServerInfo | null) => void;

  // Device slice
  device: DeviceState;
  setDeviceId: (id: string | null) => void;
  setDeviceName: (name: string) => void;
  setRegistered: (registered: boolean) => void;

  // NFC slice
  nfc: NFCState;
  setNFCSupported: (supported: boolean | null) => void;
  setNFCEnabled: (enabled: boolean | null) => void;
  setScanning: (scanning: boolean) => void;
  setLastTag: (tag: ScannedTag | null) => void;
  addScannedTag: (tag: ScannedTag) => void;
  markTagSent: (uid: string) => void;
  clearScanHistory: () => void;

  // Discovery slice
  discovery: DiscoveryState;
  setSearching: (searching: boolean) => void;
  setDiscoveredServers: (servers: DiscoveredServer[]) => void;
  addDiscoveredServer: (server: DiscoveredServer) => void;
  removeDiscoveredServer: (name: string) => void;
  selectServer: (server: DiscoveredServer | null) => void;
  clearDiscoveredServers: () => void;

  // Global actions
  reset: () => void;
  disconnect: () => void;
}

// Initial states
const initialConnectionState: ConnectionState = {
  status: "disconnected",
  serverUrl: null,
  error: null,
  lastConnected: null,
  serverInfo: null,
};

// Ensure platform is always 'ios' or 'android'
const getPlatform = (): "ios" | "android" => {
  return Platform.OS === "ios" ? "ios" : "android";
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
  isScanning: false,
  lastTag: null,
  scanHistory: [],
};

const initialDiscoveryState: DiscoveryState = {
  isSearching: false,
  discoveredServers: [],
  selectedServer: null,
};

// Create the store with persistence
export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Connection state
      connection: initialConnectionState,
      setConnectionStatus: (status) =>
        set((state) => ({
          connection: { ...state.connection, status },
        })),
      setServerUrl: (serverUrl) =>
        set((state) => ({
          connection: { ...state.connection, serverUrl },
        })),
      setConnectionError: (error) =>
        set((state) => ({
          connection: { ...state.connection, error, status: error ? "error" : state.connection.status },
        })),
      setLastConnected: (lastConnected) =>
        set((state) => ({
          connection: { ...state.connection, lastConnected },
        })),
      setServerInfo: (serverInfo) =>
        set((state) => ({
          connection: { ...state.connection, serverInfo },
        })),

      // Device state
      device: initialDeviceState,
      setDeviceId: (deviceId) =>
        set((state) => ({
          device: { ...state.device, deviceId },
        })),
      setDeviceName: (deviceName) =>
        set((state) => ({
          device: { ...state.device, deviceName },
        })),
      setRegistered: (isRegistered) =>
        set((state) => ({
          device: { ...state.device, isRegistered },
        })),

      // NFC state
      nfc: initialNFCState,
      setNFCSupported: (isSupported) =>
        set((state) => ({
          nfc: { ...state.nfc, isSupported },
        })),
      setNFCEnabled: (isEnabled) =>
        set((state) => ({
          nfc: { ...state.nfc, isEnabled },
        })),
      setScanning: (isScanning) =>
        set((state) => ({
          nfc: { ...state.nfc, isScanning },
        })),
      setLastTag: (lastTag) =>
        set((state) => ({
          nfc: { ...state.nfc, lastTag },
        })),
      addScannedTag: (tag) =>
        set((state) => ({
          nfc: {
            ...state.nfc,
            lastTag: tag,
            scanHistory: [tag, ...state.nfc.scanHistory].slice(0, 50), // Keep last 50 scans
          },
        })),
      markTagSent: (uid) =>
        set((state) => ({
          nfc: {
            ...state.nfc,
            lastTag:
              state.nfc.lastTag?.uid === uid
                ? { ...state.nfc.lastTag, sentToServer: true }
                : state.nfc.lastTag,
            scanHistory: state.nfc.scanHistory.map((tag) =>
              tag.uid === uid ? { ...tag, sentToServer: true } : tag
            ),
          },
        })),
      clearScanHistory: () =>
        set((state) => ({
          nfc: { ...state.nfc, scanHistory: [], lastTag: null },
        })),

      // Discovery state
      discovery: initialDiscoveryState,
      setSearching: (isSearching) =>
        set((state) => ({
          discovery: { ...state.discovery, isSearching },
        })),
      setDiscoveredServers: (discoveredServers) =>
        set((state) => ({
          discovery: { ...state.discovery, discoveredServers },
        })),
      addDiscoveredServer: (server) =>
        set((state) => {
          const existing = state.discovery.discoveredServers.findIndex(
            (s) => s.name === server.name
          );
          if (existing >= 0) {
            const updated = [...state.discovery.discoveredServers];
            updated[existing] = server;
            return {
              discovery: { ...state.discovery, discoveredServers: updated },
            };
          }
          return {
            discovery: {
              ...state.discovery,
              discoveredServers: [...state.discovery.discoveredServers, server],
            },
          };
        }),
      removeDiscoveredServer: (name) =>
        set((state) => ({
          discovery: {
            ...state.discovery,
            discoveredServers: state.discovery.discoveredServers.filter(
              (s) => s.name !== name
            ),
          },
        })),
      selectServer: (selectedServer) =>
        set((state) => ({
          discovery: { ...state.discovery, selectedServer },
        })),
      clearDiscoveredServers: () =>
        set((state) => ({
          discovery: { ...state.discovery, discoveredServers: [] },
        })),

      // Global actions
      reset: () =>
        set({
          connection: initialConnectionState,
          device: { ...initialDeviceState, deviceName: get().device.deviceName },
          nfc: initialNFCState,
          discovery: initialDiscoveryState,
        }),
      disconnect: () =>
        set((state) => ({
          connection: {
            ...initialConnectionState,
            serverUrl: state.connection.serverUrl,
            lastConnected: state.connection.lastConnected,
          },
          device: {
            ...state.device,
            deviceId: null,
            isRegistered: false,
          },
        })),
    }),
    {
      name: "davi-nfc-scanner-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        connection: {
          serverUrl: state.connection.serverUrl,
          lastConnected: state.connection.lastConnected,
        },
        device: {
          deviceName: state.device.deviceName,
        },
        nfc: {
          scanHistory: state.nfc.scanHistory.slice(0, 20), // Persist only last 20
        },
      }),
      // Ensure platform is always correctly set after rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.device.platform = getPlatform();
          state.device.appVersion = APP_VERSION;
        }
      },
    }
  )
);
