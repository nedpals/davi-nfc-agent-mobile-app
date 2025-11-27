import { useCallback } from "react";
import { useAppStore } from "@/stores";
import { websocketService } from "@/services/websocket";
import { discoveryService } from "@/services/discovery";
import type { DiscoveredServer } from "@/types/protocol";

export function useConnection() {
  const connection = useAppStore((state) => state.connection);
  const device = useAppStore((state) => state.device);

  const connect = useCallback(async (serverUrl: string) => {
    try {
      await websocketService.connect(serverUrl);
      await websocketService.registerDevice();
    } catch (error) {
      console.error("[useConnection] Connect failed:", error);
      throw error;
    }
  }, []);

  const connectToServer = useCallback(async (server: DiscoveredServer) => {
    const url = discoveryService.buildWebSocketUrl(server);
    await connect(url);
  }, [connect]);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  const reconnect = useCallback(async () => {
    if (connection.serverUrl) {
      await connect(connection.serverUrl);
    }
  }, [connection.serverUrl, connect]);

  return {
    // State
    status: connection.status,
    isConnected: connection.status === "connected" || connection.status === "registered",
    isRegistered: connection.status === "registered",
    error: connection.error,
    serverUrl: connection.serverUrl,
    serverInfo: connection.serverInfo,
    lastConnected: connection.lastConnected,

    // Device info
    deviceId: device.deviceId,
    deviceName: device.deviceName,

    // Actions
    connect,
    connectToServer,
    disconnect,
    reconnect,
  };
}
