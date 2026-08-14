import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/stores";
import { discoveryService } from "@/services/discovery";
import { websocketService } from "@/services/websocket";
import { useNetworkStatus } from "./useNetworkStatus";

// How long a failed address is left alone before it is worth dialling again.
const RETRY_COOLDOWN = 15000;

/**
 * Finds the agent on the local network and connects to it without being asked.
 *
 * Discovery runs only while the app has nothing to talk to, and stops as soon
 * as it does — including while the socket layer is working through its own
 * reconnect budget, which does not need discovery's help.
 */
export function useAutoConnect() {
  const status = useAppStore((state) => state.connection.status);
  const manualDisconnect = useAppStore((state) => state.connection.manualDisconnect);
  const servers = useAppStore((state) => state.discovery.discoveredServers);
  const isSearching = useAppStore((state) => state.discovery.isSearching);
  const { isOnline } = useNetworkStatus();

  const lastAttempt = useRef<{ url: string; at: number } | null>(null);
  const inFlight = useRef(false);

  // "error" is idle too: the socket layer has spent its retries, so finding the
  // agent again is now discovery's job.
  const isIdle = status === "disconnected" || status === "error";
  const shouldSearch = isIdle && !manualDisconnect && isOnline;

  useEffect(() => {
    if (!shouldSearch) {
      return;
    }

    discoveryService.startDiscovery();

    return () => {
      discoveryService.stopDiscovery();
    };
  }, [shouldSearch]);

  useEffect(() => {
    // One agent is an answer; several is a question only the user can settle.
    if (!shouldSearch || inFlight.current || servers.length !== 1) {
      return;
    }

    const server = servers[0];
    const url = discoveryService.buildWebSocketUrl(server);
    const previous = lastAttempt.current;

    // Without this, an agent that is advertising but refusing connections would
    // be dialled again the moment its own retry budget ran out.
    if (previous?.url === url && Date.now() - previous.at < RETRY_COOLDOWN) {
      return;
    }

    inFlight.current = true;
    lastAttempt.current = { url, at: Date.now() };

    websocketService
      .connectAndRegister(url)
      .then(() => discoveryService.stopDiscovery())
      .catch((error) => console.error("[AutoConnect] Failed to connect:", error))
      .finally(() => {
        inFlight.current = false;
      });
  }, [shouldSearch, servers]);

  const retry = useCallback(() => {
    lastAttempt.current = null;
    useAppStore.getState().setManualDisconnect(false);
    discoveryService.restartDiscovery();
  }, []);

  return {
    isSearching,
    isOnline,
    servers,
    retry,
  };
}
