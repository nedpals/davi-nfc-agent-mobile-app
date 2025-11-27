import { useAppStore } from "@/stores";
import { DISCOVERY_CONFIG } from "@/constants/config";
import type { DiscoveredServer } from "@/types/protocol";

class DiscoveryService {
  private static instance: DiscoveryService;
  private zeroconf: any = null;
  private isScanning = false;
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): DiscoveryService {
    if (!DiscoveryService.instance) {
      DiscoveryService.instance = new DiscoveryService();
    }
    return DiscoveryService.instance;
  }

  private async init(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Dynamically import to avoid issues when native module isn't available
      const Zeroconf = require("react-native-zeroconf").default;
      this.zeroconf = new Zeroconf();
      this.setupListeners();
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("[Discovery] Failed to initialize Zeroconf:", error);
      return false;
    }
  }

  private setupListeners(): void {
    if (!this.zeroconf) return;

    this.zeroconf.on("resolved", (service: any) => {
      console.log("[Discovery] Service resolved:", service.name);

      const server: DiscoveredServer = {
        name: service.name,
        host: service.host,
        port: service.port,
        addresses: service.addresses || [],
        txtRecords: service.txt || {},
      };

      useAppStore.getState().addDiscoveredServer(server);
    });

    this.zeroconf.on("remove", (name: string) => {
      console.log("[Discovery] Service removed:", name);
      useAppStore.getState().removeDiscoveredServer(name);
    });

    this.zeroconf.on("error", (err: Error) => {
      console.error("[Discovery] Error:", err);
      useAppStore.getState().setSearching(false);
    });

    this.zeroconf.on("start", () => {
      console.log("[Discovery] Scan started");
    });

    this.zeroconf.on("stop", () => {
      console.log("[Discovery] Scan stopped");
    });
  }

  async startDiscovery(): Promise<void> {
    // Initialize if needed
    const initialized = await this.init();
    if (!initialized || !this.zeroconf) {
      console.warn("[Discovery] Zeroconf not available - using development build required");
      useAppStore.getState().setSearching(false);
      return;
    }

    if (this.isScanning) {
      console.log("[Discovery] Already scanning");
      return;
    }

    const store = useAppStore.getState();
    store.clearDiscoveredServers();
    store.setSearching(true);

    this.isScanning = true;

    try {
      // Scan for NFC agent services
      this.zeroconf.scan(
        DISCOVERY_CONFIG.SERVICE_TYPE,
        DISCOVERY_CONFIG.PROTOCOL,
        DISCOVERY_CONFIG.DOMAIN
      );

      // Auto-stop after timeout
      this.scanTimeout = setTimeout(() => {
        this.stopDiscovery();
      }, DISCOVERY_CONFIG.TIMEOUT);
    } catch (error) {
      console.error("[Discovery] Failed to start scan:", error);
      this.isScanning = false;
      store.setSearching(false);
    }
  }

  stopDiscovery(): void {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    if (this.isScanning && this.zeroconf) {
      try {
        this.zeroconf.stop();
      } catch (error) {
        console.error("[Discovery] Failed to stop scan:", error);
      }
    }

    this.isScanning = false;
    useAppStore.getState().setSearching(false);
  }

  getDiscoveredServers(): DiscoveredServer[] {
    return useAppStore.getState().discovery.discoveredServers;
  }

  destroy(): void {
    this.stopDiscovery();
    if (this.zeroconf) {
      try {
        this.zeroconf.removeDeviceListeners();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  // Build WebSocket URL from discovered server
  buildWebSocketUrl(server: DiscoveredServer): string {
    const host = server.addresses[0] || server.host;
    const port = server.port;
    const path = server.txtRecords.path || "/ws";

    return `ws://${host}:${port}${path}`;
  }
}

export const discoveryService = DiscoveryService.getInstance();
