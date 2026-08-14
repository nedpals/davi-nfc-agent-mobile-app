import { useCallback } from "react";
import { useAppStore } from "@/stores";
import { websocketService } from "@/services/websocket";
import { discoveryService } from "@/services/discovery";
import type { DiscoveredServer } from "@/types/protocol";

export function useConnection() {
  const connection = useAppStore((state) => state.connection);
  const device = useAppStore((state) => state.device);

  const connect = useCallback(async (serverUrl: string) => {
    await websocketService.connectAndRegister(serverUrl);
  }, []);

  const connectToServer = useCallback(
    async (server: DiscoveredServer) => {
      await connect(discoveryService.buildWebSocketUrl(server));
    },
    [connect]
  );

  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  const retry = useCallback(async () => {
    await websocketService.retry();
  }, []);

  return {
    status: connection.status,
    isConnected: connection.status === "connected" || connection.status === "registered",
    isRegistered: connection.status === "registered",
    isBusy: connection.status === "connecting" || connection.status === "reconnecting",
    error: connection.error,
    serverUrl: connection.serverUrl,
    serverInfo: connection.serverInfo,
    lastConnected: connection.lastConnected,
    reconnectAttempt: connection.reconnectAttempt,
    protocolVersion: connection.protocolVersion,
    isPaired: connection.pairing !== null,
    pinningState: connection.pinningState,

    deviceId: device.deviceId,
    deviceName: device.deviceName,

    connect,
    connectToServer,
    disconnect,
    retry,
  };
}
