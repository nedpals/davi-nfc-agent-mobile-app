import { useCallback, useEffect, useRef } from "react";
import { STORED_ADDRESS_GRACE } from "@/constants/config";
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
  const serverUrl = useAppStore((state) => state.connection.serverUrl);
  const servers = useAppStore((state) => state.discovery.discoveredServers);
  const isSearching = useAppStore((state) => state.discovery.isSearching);
  const { isOnline } = useNetworkStatus();

  const lastAttempt = useRef<{ url: string; at: number } | null>(null);
  const inFlight = useRef(false);

  // "error" is idle too: the socket layer has spent its retries, so finding the
  // agent again is now discovery's job.
  const isIdle = status === "disconnected" || status === "error";
  const shouldSearch = isIdle && !manualDisconnect && isOnline;

  /** Whether this address was tried recently enough not to try it again. */
  const onCooldown = (url: string) => {
    const previous = lastAttempt.current;
    return previous?.url === url && Date.now() - previous.at < RETRY_COOLDOWN;
  };

  const dial = useCallback((url: string, options: { retryOnFailure?: boolean } = {}) => {
    inFlight.current = true;
    lastAttempt.current = { url, at: Date.now() };

    // Discovery is released by its own effect once the status leaves idle;
    // stopping it here as well would drop a subscription this hook never took.
    websocketService
      .connectAndRegister(url, options)
      .catch((error) => console.error("[AutoConnect] Failed to connect:", error))
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

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

    const url = discoveryService.buildWebSocketUrl(servers[0]);

    // Without this, an agent that is advertising but refusing connections would
    // be dialled again the moment its own retry budget ran out.
    if (onCooldown(url)) {
      return;
    }

    dial(url);
  }, [shouldSearch, servers, dial]);

  // A network that blocks mDNS never answers, and the app would sit searching
  // for an agent whose address it already knows. Discovery gets first refusal —
  // it is the only way to notice an agent that has moved — and the remembered
  // address is tried once if nothing answers.
  useEffect(() => {
    if (!shouldSearch || inFlight.current || !serverUrl || servers.length > 0) {
      return;
    }
    if (onCooldown(serverUrl)) {
      return;
    }

    const timer = setTimeout(() => {
      // A single attempt: an address that has gone stale must not swallow the
      // reconnect budget that belongs to an agent the app can still find.
      dial(serverUrl, { retryOnFailure: false });
    }, STORED_ADDRESS_GRACE);

    return () => clearTimeout(timer);
  }, [shouldSearch, serverUrl, servers.length, dial]);

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
