import { useCallback, useEffect } from "react";
import { useAppStore } from "@/stores";
import { discoveryService } from "@/services/discovery";
import type { DiscoveredServer } from "@/types/protocol";

export function useServerDiscovery() {
  const discovery = useAppStore((state) => state.discovery);
  const selectServer = useAppStore((state) => state.selectServer);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      discoveryService.stopDiscovery();
    };
  }, []);

  const startDiscovery = useCallback(async () => {
    await discoveryService.startDiscovery();
  }, []);

  const stopDiscovery = useCallback(() => {
    discoveryService.stopDiscovery();
  }, []);

  const refresh = useCallback(async () => {
    discoveryService.stopDiscovery();
    await discoveryService.startDiscovery();
  }, []);

  const handleSelectServer = useCallback(
    (server: DiscoveredServer) => {
      selectServer(server);
    },
    [selectServer]
  );

  const buildUrl = useCallback((server: DiscoveredServer): string => {
    return discoveryService.buildWebSocketUrl(server);
  }, []);

  return {
    // State
    isSearching: discovery.isSearching,
    servers: discovery.discoveredServers,
    selectedServer: discovery.selectedServer,

    // Actions
    startDiscovery,
    stopDiscovery,
    refresh,
    selectServer: handleSelectServer,
    buildUrl,
  };
}
