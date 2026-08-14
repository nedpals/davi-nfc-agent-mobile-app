import { useCallback, useEffect } from "react";
import { useAppStore } from "@/stores";
import { discoveryService } from "@/services/discovery";
import type { DiscoveredServer } from "@/types/protocol";

interface Options {
  // Browse for as long as the caller is mounted.
  autoStart?: boolean;
}

export function useServerDiscovery({ autoStart = false }: Options = {}) {
  const discovery = useAppStore((state) => state.discovery);
  const selectServer = useAppStore((state) => state.selectServer);

  useEffect(() => {
    if (!autoStart) {
      return;
    }

    discoveryService.startDiscovery();

    return () => {
      discoveryService.stopDiscovery();
    };
  }, [autoStart]);

  const startDiscovery = useCallback(() => discoveryService.startDiscovery(), []);
  const stopDiscovery = useCallback(() => discoveryService.stopDiscovery(), []);
  const refresh = useCallback(() => discoveryService.restartDiscovery(), []);
  const buildUrl = useCallback(
    (server: DiscoveredServer) => discoveryService.buildWebSocketUrl(server),
    []
  );

  return {
    isSearching: discovery.isSearching,
    servers: discovery.discoveredServers,
    selectedServer: discovery.selectedServer,

    startDiscovery,
    stopDiscovery,
    refresh,
    selectServer,
    buildUrl,
  };
}
