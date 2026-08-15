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
import { PinningError, applyPinning } from "@/services/pinning";
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
  type DeviceTransceiveRequestMessage,
  type DeviceTransceiveRequestPayload,
  type DeviceTransceiveResponsePayload,
  type DeviceWriteRequestMessage,
  type DeviceWriteRequestPayload,
  type DeviceWriteResponsePayload,
  type ErrorMessage,
  type TagScannedPayload,
} from "@/types/protocol";

/**
 * Performs a write and reports the outcome. Registered by the NFC service,
 * which owns the radio and the tag currently in the field.
 */
export type WriteHandler = (
  requestID: string,
  payload: DeviceWriteRequestPayload,
) => Promise<DeviceWriteResponsePayload>;

/** Performs a raw exchange with the tag. Registered by the NFC service. */
export type TransceiveHandler = (
  requestID: string,
  payload: DeviceTransceiveRequestPayload,
) => Promise<DeviceTransceiveResponsePayload>;

// How many idempotency keys to remember. A write is answered in seconds, so
// this only has to outlive a dropped connection and its retry.
const APPLIED_WRITE_HISTORY = 32;

/**
 * An error the agent reported, rather than one the transport produced.
 *
 * `retryable` is the field worth acting on: repeating a request the agent
 * refused on its merits will be refused again, so the reconnect loop stops
 * instead of spending its attempts on it.
 */
export class AgentError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.retryable = retryable;
  }
}

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
  // Whether a connection that never opened is worth camping on. An address the
  // app was told to try once — a remembered one, say — should be let go rather
  // than spending the whole reconnect budget on it.
  private retryOnFailure = true;
  // Settles the connect() call belonging to the live socket, so a connection
  // that is torn down before it opens rejects instead of hanging.
  private settleConnect: ((error?: Error) => void) | null = null;

  // What the agent agreed to speak. Set from the registration response rather
  // than from the subprotocol echo, because the first frame's type is what
  // actually selects the dialect.
  private offeredVersion: ProtocolVersion = 0;
  private negotiatedVersion: ProtocolVersion = 0;

  private writeHandler: WriteHandler | null = null;
  private transceiveHandler: TransceiveHandler | null = null;
  // Outcomes keyed by idempotencyKey, so a repeated request reports what
  // happened the first time instead of writing the tag again.
  private appliedWrites = new Map<string, DeviceWriteResponsePayload>();

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  async connect(serverUrl: string): Promise<void> {
    // Drop any previous socket without letting it drive the reconnect loop:
    // this connection supersedes it.
    this.teardown({ silent: true });
    this.isManualDisconnect = false;

    const store = useAppStore.getState();

    // A paired device presents its own token; the shared API secret remains the
    // fallback for an agent that has not been paired with, which the agent
    // still accepts unless it was started with -require-paired-devices.
    const credential = await loadCredential();
    const secret = credential?.deviceToken || store.connection.apiSecret;
    const wsUrl = buildDeviceUrl(serverUrl, { secret, port: credential?.agentPort });

    // Before the socket is opened: pinning takes effect for connections made
    // after this point, not for one already in flight.
    try {
      const pinning = applyPinning(credential, wsUrl);
      store.setPinningState(pinning.status);
    } catch (error) {
      if (error instanceof PinningError) {
        store.setPinningState(error.status);
        store.failConnection(error.message);
      }
      throw error;
    }

    // Hold the caller's URL rather than the dialled one: the dialled URL
    // carries the credential, and this is what gets persisted and reused on
    // reconnect.
    this.currentUrl = serverUrl;
    this.retryOnFailure = true;
    this.offeredVersion = 1;
    this.negotiatedVersion = 0;

    store.setServerUrl(serverUrl);
    store.setConnectionStatus("connecting");
    store.setConnectionError(null);
    store.setManualDisconnect(false);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const settle = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer) {
          clearTimeout(timer);
        }
        if (this.settleConnect === settle) {
          this.settleConnect = null;
        }
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      this.settleConnect = settle;

      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl, [DEVICE_SUBPROTOCOL_V1]);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error("Failed to connect");
        useAppStore.getState().failConnection(failure.message);
        reject(failure);
        return;
      }

      this.ws = socket;

      socket.onopen = () => {
        // An agent that echoes nothing predates versioning, so fall back to
        // the v0 registration frame rather than sending it a hello it will
        // reject.
        if (socket.protocol !== DEVICE_SUBPROTOCOL_V1) {
          this.offeredVersion = 0;
        }

        console.log("[WebSocket] Connected to", serverUrl, `(protocol v${this.offeredVersion})`);
        this.resetReconnect();
        useAppStore.getState().setConnectionStatus("connected");
        settle();
      };

      socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      socket.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
        // The agent rejects a bad or missing API secret before the upgrade, so
        // auth failure arrives here as a handshake error rather than as a close
        // frame or an error message on the socket.
        const detail = (error as { message?: string } | undefined)?.message;
        useAppStore.getState().setConnectionError(detail || "WebSocket connection error");
      };

      socket.onclose = (event) => {
        console.log("[WebSocket] Closed:", event.code, event.reason);
        // A socket that closes before it ever opened has to reject the connect
        // call itself; nothing else will, and the caller would wait forever.
        settle(new Error(event.reason || "The agent closed the connection"));
        this.handleDisconnect();
      };

      timer = setTimeout(() => {
        if (settled) {
          return;
        }
        // Closing drives the usual disconnect path, so the reconnect loop picks
        // this up like any other dropped connection.
        socket.close();
        settle(new Error("Connection timeout"));
      }, WS_CONFIG.REQUEST_TIMEOUT);
    });
  }

  /**
   * Connect and register in one step, which is what every caller wants.
   *
   * `retryOnFailure: false` makes this a single attempt: an address that never
   * answers is dropped instead of held onto, so whatever else was looking for
   * an agent can carry on. A connection that does come up is retried as usual
   * if it later drops.
   */
  async connectAndRegister(
    serverUrl: string,
    { retryOnFailure = true }: { retryOnFailure?: boolean } = {},
  ): Promise<void> {
    await this.connect(serverUrl);
    this.retryOnFailure = retryOnFailure;

    try {
      await this.registerDevice();
    } catch (error) {
      if (error instanceof AgentError && !error.retryable) {
        // The agent refused this device rather than failing to hear it, so
        // retrying the identical registration cannot succeed.
        this.stopReconnecting(error.message);
      } else if (this.isConnected()) {
        // The socket is still up but unusable without a device ID. Close it so
        // the normal disconnect path decides whether to retry.
        this.ws?.close();
      }
      throw error;
    }
  }

  disconnect(): void {
    this.isManualDisconnect = true;
    this.sendGoodbye("device disconnected");
    this.resetReconnect();
    this.teardown({ silent: true });

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

    // An unsuccessful response is not an error frame, so it would otherwise
    // resolve and leave the app reading as connected but unregistered.
    if (!response.success || !response.payload?.deviceID) {
      throw new AgentError(
        "The agent did not accept this device's registration.",
        "REGISTRATION_REJECTED",
        false,
      );
    }

    // Read the version back rather than assuming the request was honoured —
    // the agent answers at its own maximum when asked for something newer.
    this.negotiatedVersion =
      response.type === "helloResponse" ? response.payload.protocolVersion : 0;

    store.setDeviceId(response.payload.deviceID);
    store.setRegistered(true);
    store.setServerInfo(response.payload.serverInfo);
    store.setProtocolVersion(this.negotiatedVersion);
    store.setConnectionStatus("registered");
    store.setConnectionError(null);
    // The address answered, so a later drop is worth reconnecting to even if
    // this attempt was only meant to be a single try.
    this.retryOnFailure = true;
    store.setLastConnected(new Date());
    this.resetReconnect();
    this.startHeartbeat();

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

    // Only a frame that actually went out is worth showing as sent.
    if (this.send(message)) {
      store.markTagSent(tagData.uid);
    }
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
  }

  private sendHeartbeat(): void {
    const deviceId = useAppStore.getState().device.deviceId;

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

  private send(message: BaseMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("[WebSocket] Cannot send: not connected");
      return false;
    }

    this.ws.send(JSON.stringify(message));
    return true;
  }

  private async sendRequest<T extends BaseMessage>(message: BaseMessage): Promise<T> {
    const id = message.id ?? this.generateRequestId();
    message.id = id;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new AgentError("The agent did not answer in time.", "TIMEOUT", true));
      }, WS_CONFIG.REQUEST_TIMEOUT);

      this.pendingRequests.set(id, {
        resolve: resolve as (response: unknown) => void,
        reject,
        timeout,
      });

      if (!this.send(message)) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(new AgentError("Not connected to the agent.", "NOT_CONNECTED", true));
      }
    });
  }

  private handleMessage(data: string): void {
    let message: BaseMessage;
    try {
      message = JSON.parse(data) as BaseMessage;
    } catch (error) {
      console.error("[WebSocket] Failed to parse message:", error);
      return;
    }

    const pending = message.id ? this.pendingRequests.get(message.id) : undefined;
    if (pending && message.id) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);

      if (message.type === "error") {
        pending.reject(this.toAgentError(message as ErrorMessage));
      } else {
        pending.resolve(message);
      }
      return;
    }

    switch (message.type) {
      case "error": {
        const agentError = this.toAgentError(message as ErrorMessage);
        console.error("[WebSocket] Agent error:", agentError.code, agentError.message);
        // Recorded, but not treated as losing the connection: the socket is
        // still open and still registered.
        useAppStore.getState().setConnectionError(agentError.message);
        break;
      }

      case "deviceTransceiveRequest":
        void this.handleTransceiveRequest(message as DeviceTransceiveRequestMessage);
        break;

      // Not awaited: a write may take 20s, and blocking the reader that long
      // would stall heartbeats and every frame behind it.
      case "deviceWriteRequest":
        void this.handleWriteRequest(message as DeviceWriteRequestMessage);
        break;

      default:
        console.log("[WebSocket] Unhandled message type:", message.type);
    }
  }

  /**
   * Always answers, including when it refuses: the agent holds the request open
   * for 20 seconds, and silence turns a refusal into a timeout.
   */
  private async handleWriteRequest(message: DeviceWriteRequestMessage): Promise<void> {
    const payload = message.payload;
    const requestID = payload?.requestID ?? message.id ?? "";
    const key = payload?.idempotencyKey;

    const previous = key ? this.appliedWrites.get(key) : undefined;
    if (previous) {
      // The same logical write arriving twice means the first response was
      // lost, not that the tag should be written again.
      console.log("[WebSocket] Replaying earlier outcome for write", key);
      this.send({
        id: message.id,
        type: "deviceWriteResponse",
        payload: { ...previous, requestID },
      });
      return;
    }

    const result = await this.performWrite(requestID, payload);

    if (key) {
      this.rememberWrite(key, result);
    }

    this.send({ id: message.id, type: "deviceWriteResponse", payload: result });
  }

  /**
   * Register what actually performs a write.
   *
   * The NFC service registers itself rather than being imported here: it
   * already depends on this module to send what it scans, and importing it back
   * would close a cycle between the two.
   */
  setWriteHandler(handler: WriteHandler | null): void {
    this.writeHandler = handler;
  }

  setTransceiveHandler(handler: TransceiveHandler | null): void {
    this.transceiveHandler = handler;
  }

  /**
   * Exchange bytes with the tag and report the reply.
   *
   * There is no idempotency key here and none is wanted: an exchange is a
   * question to the tag, and whether asking twice is safe is the agent's call,
   * not this device's.
   */
  private async handleTransceiveRequest(
    message: DeviceTransceiveRequestMessage,
  ): Promise<void> {
    const payload = message.payload;
    const requestID = payload?.requestID ?? message.id ?? "";

    let result: DeviceTransceiveResponsePayload;

    if (!payload) {
      result = {
        requestID,
        success: false,
        error: "Transceive request carried no payload",
        errorCode: "INVALID_DATA",
      };
    } else if (!this.transceiveHandler) {
      result = {
        requestID,
        success: false,
        error: "This device cannot exchange raw commands",
        errorCode: "NOT_SUPPORTED",
      };
    } else {
      try {
        result = await this.transceiveHandler(requestID, payload);
      } catch (error) {
        result = {
          requestID,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: "TRANSCEIVE_FAILED",
        };
      }
    }

    this.send({ id: message.id, type: "deviceTransceiveResponse", payload: result });
  }

  private async performWrite(
    requestID: string,
    payload: DeviceWriteRequestPayload | undefined,
  ): Promise<DeviceWriteResponsePayload> {
    if (!payload) {
      return {
        requestID,
        success: false,
        error: "Write request carried no payload",
        errorCode: "INVALID_DATA",
      };
    }

    if (!this.writeHandler) {
      return {
        requestID,
        success: false,
        error: "This device cannot write tags",
        errorCode: "NOT_SUPPORTED",
      };
    }

    try {
      return await this.writeHandler(requestID, payload);
    } catch (error) {
      // A handler that throws is still an outcome the agent needs to hear.
      return {
        requestID,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: "WRITE_FAILED",
      };
    }
  }

  /** Bounded, because a long-lived connection would otherwise accumulate keys. */
  private rememberWrite(key: string, result: DeviceWriteResponsePayload): void {
    this.appliedWrites.set(key, result);

    while (this.appliedWrites.size > APPLIED_WRITE_HISTORY) {
      const oldest = this.appliedWrites.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.appliedWrites.delete(oldest);
    }
  }

  private toAgentError(message: ErrorMessage): AgentError {
    const code = message.payload?.code ?? "UNKNOWN";
    // Absent means the agent predates the field; assuming it is retryable
    // keeps a v0 agent behaving as it did before.
    const retryable = message.payload?.retryable ?? true;
    return new AgentError(message.error || code, code, retryable);
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

    if (!this.retryOnFailure) {
      // A single attempt that came to nothing. Left disconnected rather than
      // failed: nothing is wrong with the app, this address simply did not
      // answer, and something else is still looking.
      this.retryOnFailure = true;
      this.currentUrl = null;
      store.setConnectionStatus("disconnected");
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout || this.isManualDisconnect || !this.currentUrl) {
      return;
    }

    const store = useAppStore.getState();

    if (this.reconnectAttempts >= WS_CONFIG.RECONNECT.MAX_ATTEMPTS) {
      store.failConnection("Could not reach the agent. Tap to try again.");
      return;
    }

    const attempt = this.reconnectAttempts + 1;
    store.setConnectionStatus("reconnecting");
    store.setReconnectAttempt(attempt);

    const delay = Math.min(
      WS_CONFIG.RECONNECT.INITIAL_DELAY *
        Math.pow(WS_CONFIG.RECONNECT.BACKOFF_MULTIPLIER, this.reconnectAttempts),
      WS_CONFIG.RECONNECT.MAX_DELAY
    );

    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const finalDelay = delay + jitter;

    console.log(
      `[WebSocket] Reconnecting in ${Math.round(finalDelay)}ms (attempt ${attempt}/${
        WS_CONFIG.RECONNECT.MAX_ATTEMPTS
      })`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      // Counted here rather than in connect(), which resets the counter on a
      // connection that actually opens.
      this.reconnectAttempts = attempt;

      const url = this.currentUrl;
      if (!url || this.isManualDisconnect) {
        return;
      }

      this.connectAndRegister(url).catch((error) => {
        console.error("[WebSocket] Reconnection failed:", error);
      });
    }, finalDelay);
  }

  /** Give up on the current URL until something asks for it again. */
  private stopReconnecting(message: string): void {
    this.cancelReconnectTimer();
    this.reconnectAttempts = WS_CONFIG.RECONNECT.MAX_ATTEMPTS;
    useAppStore.getState().failConnection(message);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private resetReconnect(): void {
    this.cancelReconnectTimer();
    this.reconnectAttempts = 0;
    useAppStore.getState().setReconnectAttempt(0);
  }

  /**
   * Drop the socket and everything hanging off it. A silent teardown detaches
   * the close handler first, so the socket being replaced cannot restart the
   * reconnect loop on its way out.
   */
  private teardown({ silent }: { silent: boolean }): void {
    this.stopHeartbeat();
    this.clearPendingRequests();
    this.settleConnect?.(new Error("Connection replaced by a newer one"));

    if (this.ws) {
      if (silent) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;
      }
      this.ws.close();
      this.ws = null;
    }
  }

  private clearPendingRequests(): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new AgentError("Connection closed.", "CONNECTION_CLOSED", true));
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
    return this.isConnected() && useAppStore.getState().device.isRegistered;
  }

  /** Whether a dropped connection still has retries left. */
  canRetry(): boolean {
    return this.currentUrl !== null;
  }

  /** Start over from the last URL, clearing a spent retry budget. */
  async retry(): Promise<void> {
    const url = this.currentUrl ?? useAppStore.getState().connection.serverUrl;
    if (!url) {
      return;
    }

    this.resetReconnect();
    this.isManualDisconnect = false;
    await this.connectAndRegister(url);
  }
}

export const websocketService = WebSocketService.getInstance();
