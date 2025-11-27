import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/stores";
import { discoveryService } from "@/services/discovery";
import { websocketService } from "@/services/websocket";

/**
 * Hook that automatically discovers servers and connects to the first one found.
 * Starts discovery on mount and auto-connects when a server is discovered.
 */
export function useAutoConnect() {
  const connection = useAppStore((state) => state.connection);
  const discovery = useAppStore((state) => state.discovery);
  const clearDiscoveredServers = useAppStore((state) => state.clearDiscoveredServers);
  const isConnectingRef = useRef(false);
  const hasAutoConnectedRef = useRef(false);
  const hasStartedRef = useRef(false);

  // Start discovery on mount - always clear old servers and start fresh
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Clear any stale servers from previous session
    clearDiscoveredServers();

    // Only start discovery if not already connected
    if (
      connection.status !== "connected" &&
      connection.status !== "registered" &&
      connection.status !== "connecting"
    ) {
      console.log("[AutoConnect] Starting server discovery on mount");
      discoveryService.startDiscovery();
    }

    return () => {
      discoveryService.stopDiscovery();
    };
  }, [clearDiscoveredServers, connection.status]);

  // Auto-connect only when exactly one server is discovered
  useEffect(() => {
    const servers = discovery.discoveredServers;

    // Don't auto-connect if:
    // - Already connected/registered
    // - Currently connecting
    // - No servers discovered
    // - Multiple servers discovered (let user choose)
    // - Already auto-connected this session
    if (
      connection.status === "connected" ||
      connection.status === "registered" ||
      connection.status === "connecting" ||
      isConnectingRef.current ||
      servers.length !== 1 ||
      hasAutoConnectedRef.current
    ) {
      return;
    }

    const server = servers[0];
    isConnectingRef.current = true;
    hasAutoConnectedRef.current = true;

    console.log("[AutoConnect] Discovered server, auto-connecting:", server.name);

    const url = discoveryService.buildWebSocketUrl(server);

    websocketService
      .connect(url)
      .then(() => websocketService.registerDevice())
      .then(() => {
        console.log("[AutoConnect] Successfully connected to", server.name);
        discoveryService.stopDiscovery();
      })
      .catch((error) => {
        console.error("[AutoConnect] Failed to connect:", error);
        // Reset so we can try again if a new server is found
        hasAutoConnectedRef.current = false;
      })
      .finally(() => {
        isConnectingRef.current = false;
      });
  }, [discovery.discoveredServers, connection.status]);

  // Retry connection
  const retry = useCallback(() => {
    hasAutoConnectedRef.current = false;
    isConnectingRef.current = false;
    clearDiscoveredServers();
    discoveryService.stopDiscovery();
    discoveryService.startDiscovery();
  }, [clearDiscoveredServers]);

  return {
    isSearching: discovery.isSearching,
    servers: discovery.discoveredServers,
    retry,
  };
}
