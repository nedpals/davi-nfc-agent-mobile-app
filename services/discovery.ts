import { useAppStore } from "@/stores";
import { DISCOVERY_CONFIG, WS_CONFIG } from "@/constants/config";
import { buildDeviceUrl, formatHost } from "@/services/agent-url";
import type { DiscoveredServer } from "@/types/protocol";

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * The address to dial out of everything mDNS resolved.
 *
 * IPv4 first: the agent binds it, and a link-local IPv6 address resolves on
 * the same interface but needs a scope the URL cannot carry. The `.local.`
 * hostname is the last resort, since it depends on the phone's own resolver.
 */
export function preferredAddress(server: Pick<DiscoveredServer, "addresses" | "host">): string {
  const addresses = server.addresses ?? [];
  return addresses.find((address) => IPV4_RE.test(address)) ?? addresses[0] ?? server.host;
}

class DiscoveryService {
  private static instance: DiscoveryService;
  private zeroconf: any = null;
  private isScanning = false;
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;
  private subscribers = 0;

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

  /**
   * Register interest in discovery, starting a scan if none is running.
   *
   * The scanner screen and the server list both want to be browsing, and they
   * come and go independently, so interest is counted rather than assumed:
   * closing one of them must not stop a scan the other still needs.
   */
  async startDiscovery(): Promise<void> {
    this.subscribers += 1;
    if (this.subscribers === 1) {
      await this.beginScan();
    }
  }

  /** Drop interest registered by startDiscovery, stopping the last one out. */
  stopDiscovery(): void {
    this.subscribers = Math.max(0, this.subscribers - 1);
    if (this.subscribers === 0) {
      this.endScan();
    }
  }

  /** Scan again from scratch without disturbing who is interested. */
  async restartDiscovery(): Promise<void> {
    this.endScan();
    if (this.subscribers > 0) {
      await this.beginScan();
    }
  }

  private async beginScan(): Promise<void> {
    const initialized = await this.init();
    if (!initialized || !this.zeroconf) {
      console.warn("[Discovery] Zeroconf unavailable — a development build is required");
      useAppStore.getState().setSearching(false);
      return;
    }

    if (this.isScanning) {
      return;
    }

    const store = useAppStore.getState();
    store.clearDiscoveredServers();
    store.setSearching(true);

    this.isScanning = true;

    try {
      this.zeroconf.scan(
        DISCOVERY_CONFIG.SERVICE_TYPE,
        DISCOVERY_CONFIG.PROTOCOL,
        DISCOVERY_CONFIG.DOMAIN
      );

      // Browsing indefinitely costs battery for a network that rarely changes,
      // so the scan lapses and the UI offers to run it again.
      this.scanTimeout = setTimeout(() => {
        this.endScan();
      }, DISCOVERY_CONFIG.TIMEOUT);
    } catch (error) {
      console.error("[Discovery] Failed to start scan:", error);
      this.isScanning = false;
      store.setSearching(false);
    }
  }

  private endScan(): void {
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
    this.subscribers = 0;
    this.endScan();
    if (this.zeroconf) {
      try {
        this.zeroconf.removeDeviceListeners();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Build WebSocket URL from discovered server
  buildWebSocketUrl(server: DiscoveredServer): string {
    const host = formatHost(preferredAddress(server));
    const port = server.port || WS_CONFIG.DEFAULT_PORT;
    const { tls, device_path, path } = server.txtRecords ?? {};
    const endpoint = device_path || path || WS_CONFIG.DEFAULT_PATH;

    // An agent that advertises no tls record predates it. Leaving tls
    // undefined lets the URL builder assume TLS, which is what such an agent
    // serves unless it was started with -auto-tls=false.
    return buildDeviceUrl(`${host}:${port}${endpoint}`, {
      tls: tls === undefined ? undefined : tls !== "false",
    });
  }
}

export const discoveryService = DiscoveryService.getInstance();
