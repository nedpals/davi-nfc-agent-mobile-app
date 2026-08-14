import { Platform } from "react-native";
import {
  WS_CONFIG,
  APP_VERSION,
  getDeviceCapabilities,
  getDeviceMetadata,
  getDeviceName,
} from "@/constants/config";
import { buildDeviceUrl } from "@/services/agent-url";
import { loadCredential } from "@/services/credentials";
import { useAppStore } from "@/stores";
import {
  DEVICE_SUBPROTOCOL_V1,
  type BaseMessage,
  type GoodbyeMessage,
  type HelloMessage,
  type HelloResponse,
  type ProtocolVersion,
  type RegisterDeviceMessage,
  type RegisterDeviceResponse,
  type TagScannedMessage,
  type TagRemovedMessage,
  type DeviceHeartbeatMessage,
  type ErrorMessage,
  type TagScannedPayload,
} from "@/types/protocol";

interface PendingRequest {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentUrl: string | null = null;
  private isManualDisconnect = false;

  // What the agent agreed to speak. Set from the registration response rather
  // than from the subprotocol echo, because the first frame's type is what
  // actually selects the dialect.
  private offeredVersion: ProtocolVersion = 0;
  private negotiatedVersion: ProtocolVersion = 0;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  async connect(serverUrl: string): Promise<void> {
    // Clean up existing connection
    this.disconnect();
    this.isManualDisconnect = false;

    const store = useAppStore.getState();

    // A paired device presents its own token; the shared API secret remains the
    // fallback for an agent that has not been paired with, which the agent
    // still accepts unless it was started with -require-paired-devices.
    const credential = await loadCredential();
    const secret = credential?.deviceToken || store.connection.apiSecret;
    const wsUrl = buildDeviceUrl(serverUrl, { secret });

    // Hold the caller's URL rather than the dialled one: the dialled URL
    // carries the credential, and this is what gets persisted and reused on
    // reconnect.
    this.currentUrl = serverUrl;
    this.offeredVersion = 1;
    this.negotiatedVersion = 0;

    store.setServerUrl(serverUrl);
    store.setConnectionStatus("connecting");
    store.setConnectionError(null);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl, [DEVICE_SUBPROTOCOL_V1]);

        this.ws.onopen = () => {
          // An agent that echoes nothing predates versioning, so fall back to
          // the v0 registration frame rather than sending it a hello it will
          // reject.
          if (this.ws?.protocol !== DEVICE_SUBPROTOCOL_V1) {
            this.offeredVersion = 0;
          }

          console.log(
            "[WebSocket] Connected to",
            serverUrl,
            `(protocol v${this.offeredVersion})`,
          );
          this.reconnectAttempts = 0;
          useAppStore.getState().setConnectionStatus("connected");
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error("[WebSocket] Error:", error);
          // The agent rejects a bad or missing API secret before the upgrade,
          // so auth failure arrives here as a handshake error rather than as a
          // close frame or an error message on the socket.
          const detail = (error as { message?: string } | undefined)?.message;
          useAppStore
            .getState()
            .setConnectionError(detail || "WebSocket connection error");
        };

        this.ws.onclose = (event) => {
          console.log("[WebSocket] Closed:", event.code, event.reason);
          this.handleDisconnect();
        };

        // Connection timeout
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error("Connection timeout"));
          }
        }, WS_CONFIG.REQUEST_TIMEOUT);
      } catch (error) {
        useAppStore.getState().setConnectionError(
          error instanceof Error ? error.message : "Failed to connect"
        );
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.isManualDisconnect = true;
    this.sendGoodbye("device disconnected");
    this.stopHeartbeat();
    this.cancelReconnect();
    this.clearPendingRequests();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection
      this.ws.close();
      this.ws = null;
    }

    useAppStore.getState().disconnect();
  }

  async registerDevice(): Promise<RegisterDeviceResponse | HelloResponse> {
    const store = useAppStore.getState();
    const { device } = store;

    // Always compute platform directly to avoid stale/empty values from store
    const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
    const deviceName = device.deviceName || getDeviceName();

    const registration = {
      deviceName,
      platform,
      appVersion: APP_VERSION,
      capabilities: getDeviceCapabilities(),
      metadata: getDeviceMetadata(),
    };

    // The first frame's type is what actually selects the dialect, so the
    // subprotocol the agent echoed is a hint about which one it will accept.
    const message: HelloMessage | RegisterDeviceMessage =
      this.offeredVersion === 1
        ? {
            id: this.generateRequestId(),
            type: "hello",
            payload: { protocolVersion: 1, ...registration },
          }
        : {
            id: this.generateRequestId(),
            type: "registerDevice",
            payload: registration,
          };

    const response = await this.sendRequest<RegisterDeviceResponse | HelloResponse>(message);

    if (response.success) {
      // Read the version back rather than assuming the request was honoured —
      // the agent answers at its own maximum when asked for something newer.
      this.negotiatedVersion =
        response.type === "helloResponse" ? response.payload.protocolVersion : 0;

      store.setDeviceId(response.payload.deviceID);
      store.setRegistered(true);
      store.setServerInfo(response.payload.serverInfo);
      store.setProtocolVersion(this.negotiatedVersion);
      store.setConnectionStatus("registered");
      store.setLastConnected(new Date());
      this.startHeartbeat();
    }

    return response;
  }

  /**
   * Tell the agent this device is leaving, so it logs a departure rather than
   * waiting out a device it believes it lost. Best effort: a socket that is
   * already gone simply has nothing to say.
   */
  private sendGoodbye(reason: string): void {
    const deviceId = useAppStore.getState().device.deviceId;
    if (!deviceId || this.negotiatedVersion < 1 || !this.isConnected()) {
      return;
    }

    const message: GoodbyeMessage = {
      type: "goodbye",
      payload: { deviceID: deviceId, reason },
    };

    this.send(message);
  }

  sendTagScanned(tagData: Omit<TagScannedPayload, "deviceID">): void {
    const store = useAppStore.getState();
    const deviceId = store.device.deviceId;

    if (!deviceId) {
      console.error("[WebSocket] Cannot send tag: device not registered");
      return;
    }

    const message: TagScannedMessage = {
      type: "tagScanned",
      payload: {
        ...tagData,
        deviceID: deviceId,
      },
    };

    this.send(message);
    store.markTagSent(tagData.uid);
  }

  sendTagRemoved(uid: string): void {
    const store = useAppStore.getState();
    const deviceId = store.device.deviceId;

    if (!deviceId) {
      console.error("[WebSocket] Cannot send tag removed: device not registered");
      return;
    }

    const message: TagRemovedMessage = {
      type: "tagRemoved",
      payload: {
        deviceID: deviceId,
        uid,
        removedAt: new Date().toISOString(),
      },
    };

    this.send(message);
    console.log("[WebSocket] Sent tagRemoved for uid:", uid);
  }

  private sendHeartbeat(): void {
    const store = useAppStore.getState();
    const deviceId = store.device.deviceId;

    if (!deviceId || !this.isConnected()) {
      return;
    }

    const message: DeviceHeartbeatMessage = {
      type: "deviceHeartbeat",
      payload: {
        deviceID: deviceId,
        timestamp: new Date().toISOString(),
      },
    };

    this.send(message);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, WS_CONFIG.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private send(message: BaseMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("[WebSocket] Cannot send: not connected");
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  private async sendRequest<T extends BaseMessage>(
    message: BaseMessage
  ): Promise<T> {
    if (!message.id) {
      message.id = this.generateRequestId();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id!);
        reject(new Error(`Request ${message.id} timed out`));
      }, WS_CONFIG.REQUEST_TIMEOUT);

      this.pendingRequests.set(message.id!, {
        resolve: resolve as (response: unknown) => void,
        reject,
        timeout,
      });

      this.send(message);
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as BaseMessage;

      // Check if this is a response to a pending request
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.type === "error") {
          pending.reject(new Error((message as ErrorMessage).error));
        } else {
          pending.resolve(message);
        }
        return;
      }

      // Handle other message types
      switch (message.type) {
        case "error":
          console.error("[WebSocket] Server error:", (message as ErrorMessage).error);
          useAppStore.getState().setConnectionError((message as ErrorMessage).error);
          break;

        default:
          console.log("[WebSocket] Unhandled message type:", message.type);
      }
    } catch (error) {
      console.error("[WebSocket] Failed to parse message:", error);
    }
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();
    this.clearPendingRequests();

    const store = useAppStore.getState();
    store.setRegistered(false);
    store.setDeviceId(null);

    if (this.isManualDisconnect) {
      store.setConnectionStatus("disconnected");
      return;
    }

    // Attempt reconnection
    if (this.reconnectAttempts < WS_CONFIG.RECONNECT.MAX_ATTEMPTS) {
      this.scheduleReconnect();
    } else {
      store.setConnectionStatus("error");
      store.setConnectionError("Max reconnection attempts reached");
    }
  }

  private scheduleReconnect(): void {
    // Don't schedule if already reconnecting or manually disconnected
    if (this.reconnectTimeout || this.isManualDisconnect) {
      return;
    }

    const store = useAppStore.getState();
    store.setConnectionStatus("reconnecting");

    const delay = Math.min(
      WS_CONFIG.RECONNECT.INITIAL_DELAY *
        Math.pow(WS_CONFIG.RECONNECT.BACKOFF_MULTIPLIER, this.reconnectAttempts),
      WS_CONFIG.RECONNECT.MAX_DELAY
    );

    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const finalDelay = delay + jitter;

    console.log(
      `[WebSocket] Reconnecting in ${Math.round(finalDelay)}ms (attempt ${
        this.reconnectAttempts + 1
      }/${WS_CONFIG.RECONNECT.MAX_ATTEMPTS})`
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      this.reconnectAttempts++;

      if (this.currentUrl && !this.isManualDisconnect) {
        try {
          await this.connect(this.currentUrl);
          await this.registerDevice();
        } catch (error) {
          console.error("[WebSocket] Reconnection failed:", error);
          // If registration fails, stop reconnecting (likely a config issue)
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes("Platform") || errorMsg.includes("Invalid")) {
            console.error("[WebSocket] Registration error - stopping reconnection");
            store.setConnectionStatus("error");
            store.setConnectionError(errorMsg);
            this.reconnectAttempts = WS_CONFIG.RECONNECT.MAX_ATTEMPTS; // Stop retrying
          }
        }
      }
    }, finalDelay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
  }

  private clearPendingRequests(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  isRegistered(): boolean {
    return useAppStore.getState().device.isRegistered;
  }
}

export const websocketService = WebSocketService.getInstance();
