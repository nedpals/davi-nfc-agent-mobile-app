import { useAppStore } from "@/stores";
import { DEVICE_SUBPROTOCOL_V1 } from "@/types/protocol";

// Real timers with a short budget keep the reconnect test honest about the
// backoff without making it slow.
jest.mock("@/constants/config", () => {
  const actual = jest.requireActual("@/constants/config");
  return {
    ...actual,
    WS_CONFIG: {
      ...actual.WS_CONFIG,
      REQUEST_TIMEOUT: 200,
      HEARTBEAT_INTERVAL: 10000,
      RECONNECT: { INITIAL_DELAY: 5, MAX_DELAY: 10, MAX_ATTEMPTS: 3, BACKOFF_MULTIPLIER: 2 },
    },
  };
});

type Handler = ((event: any) => void) | null;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  static last(): FakeWebSocket {
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!socket) {
      throw new Error("No socket was opened");
    }
    return socket;
  }

  readyState = FakeWebSocket.CONNECTING;
  protocol = "";
  sent: string[] = [];

  onopen: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onmessage: Handler = null;

  constructor(
    public url: string,
    public protocols?: string[]
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "" });
  }

  triggerOpen(protocol = DEVICE_SUBPROTOCOL_V1) {
    this.readyState = FakeWebSocket.OPEN;
    this.protocol = protocol;
    this.onopen?.({});
  }

  triggerClose(code = 1006, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  lastMessage(): any {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }

  reply(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

(globalThis as any).WebSocket = FakeWebSocket;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function waitFor(predicate: () => boolean, timeout = 500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for condition");
}

 
const { websocketService, AgentError } = require("@/services/websocket");

/** Open a socket and settle the connect() promise it returned. */
async function openConnection(url = "192.168.1.5:9470", protocol = DEVICE_SUBPROTOCOL_V1) {
  const connecting = websocketService.connect(url);
  await tick();
  FakeWebSocket.last().triggerOpen(protocol);
  await connecting;
  return FakeWebSocket.last();
}

function registrationResponse(socket: FakeWebSocket, overrides: Record<string, unknown> = {}) {
  const request = socket.lastMessage();
  socket.reply({
    id: request.id,
    type: request.type === "hello" ? "helloResponse" : "registerDeviceResponse",
    success: true,
    payload: {
      deviceID: "device-123",
      protocolVersion: 1,
      serverInfo: { version: "1.0.4", supportedNFC: ["NTAG"] },
    },
    ...overrides,
  });
}

beforeEach(() => {
  websocketService.disconnect();
  FakeWebSocket.instances = [];
  useAppStore.getState().reset();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  websocketService.disconnect();
  jest.restoreAllMocks();
});

describe("connect", () => {
  it("dials the device endpoint with the mode discriminator", async () => {
    await openConnection();

    expect(FakeWebSocket.last().url).toBe("wss://192.168.1.5:9470/ws?mode=device");
    expect(FakeWebSocket.last().protocols).toEqual([DEVICE_SUBPROTOCOL_V1]);
    expect(useAppStore.getState().connection.status).toBe("connected");
  });

  it("rejects when the socket closes before it ever opened", async () => {
    const connecting = websocketService.connect("192.168.1.5:9470");
    await tick();
    FakeWebSocket.last().triggerClose(1006, "handshake refused");

    await expect(connecting).rejects.toThrow("handshake refused");
  });

  it("rejects rather than hanging when a second connect supersedes the first", async () => {
    const first = websocketService.connect("192.168.1.5:9470");
    await tick();
    const second = websocketService.connect("192.168.1.6:9470");

    await expect(first).rejects.toThrow(/replaced/i);

    await tick();
    FakeWebSocket.last().triggerOpen();
    await expect(second).resolves.toBeUndefined();
  });

  it("clears a manual disconnect so discovery may reconnect", async () => {
    websocketService.disconnect();
    expect(useAppStore.getState().connection.manualDisconnect).toBe(true);

    await openConnection();
    expect(useAppStore.getState().connection.manualDisconnect).toBe(false);
  });
});

describe("registerDevice", () => {
  it("sends hello when the agent echoed the versioned subprotocol", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();

    expect(socket.lastMessage()).toMatchObject({
      type: "hello",
      payload: { protocolVersion: 1, platform: expect.any(String) },
    });

    registrationResponse(socket);
    await registering;

    const { connection, device } = useAppStore.getState();
    expect(connection.status).toBe("registered");
    expect(connection.protocolVersion).toBe(1);
    expect(connection.serverInfo).toEqual({ version: "1.0.4", supportedNFC: ["NTAG"] });
    expect(device.deviceId).toBe("device-123");
    expect(device.isRegistered).toBe(true);
  });

  it("falls back to registerDevice against an agent that predates versioning", async () => {
    const socket = await openConnection("192.168.1.5:9470", "");
    const registering = websocketService.registerDevice();
    await tick();

    expect(socket.lastMessage().type).toBe("registerDevice");

    registrationResponse(socket);
    await registering;

    expect(useAppStore.getState().connection.protocolVersion).toBe(0);
  });

  it("reads the negotiated version back rather than assuming the one it asked for", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();

    const request = socket.lastMessage();
    socket.reply({
      id: request.id,
      type: "helloResponse",
      success: true,
      payload: {
        deviceID: "device-123",
        protocolVersion: 0,
        serverInfo: { version: "1.0.0", supportedNFC: [] },
      },
    });
    await registering;

    expect(useAppStore.getState().connection.protocolVersion).toBe(0);
  });

  it("throws when the agent refuses the registration instead of reporting success", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();

    const request = socket.lastMessage();
    socket.reply({ id: request.id, type: "helloResponse", success: false, payload: {} });

    await expect(registering).rejects.toBeInstanceOf(AgentError);
    expect(useAppStore.getState().device.isRegistered).toBe(false);
  });

  it("surfaces an error frame as a retryable agent error", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();

    const request = socket.lastMessage();
    socket.reply({
      id: request.id,
      type: "error",
      success: false,
      error: "Agent is busy",
      payload: { code: "BUSY", retryable: true },
    });

    await expect(registering).rejects.toMatchObject({ code: "BUSY", retryable: true });
  });
});

describe("reconnection", () => {
  it("counts attempts up instead of restarting the budget on every try", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();
    registrationResponse(socket);
    await registering;

    // The agent drops the connection, and every retry fails to open.
    socket.triggerClose();

    await waitFor(() => useAppStore.getState().connection.reconnectAttempt >= 1);
    expect(useAppStore.getState().connection.status).toBe("reconnecting");

    for (let attempt = 1; attempt <= 3; attempt++) {
      await waitFor(() => FakeWebSocket.instances.length > attempt);
      FakeWebSocket.last().triggerClose();
    }

    // Three attempts is the whole budget, so the app stops and says so rather
    // than retrying forever at the shortest delay.
    await waitFor(() => useAppStore.getState().connection.status === "error");
    expect(useAppStore.getState().connection.error).toMatch(/could not reach/i);
    expect(FakeWebSocket.instances.length).toBeLessThanOrEqual(5);
  });

  it("does not reconnect after the user disconnects", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();
    registrationResponse(socket);
    await registering;

    const opened = FakeWebSocket.instances.length;
    websocketService.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(FakeWebSocket.instances.length).toBe(opened);
    expect(useAppStore.getState().connection.status).toBe("disconnected");
  });

  it("clears the device identity when the connection drops", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();
    registrationResponse(socket);
    await registering;

    socket.triggerClose();
    await tick();

    const { device } = useAppStore.getState();
    expect(device.deviceId).toBeNull();
    expect(device.isRegistered).toBe(false);
  });
});

describe("sending tags", () => {
  async function registered() {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();
    registrationResponse(socket);
    await registering;
    return socket;
  }

  it("sends a scan and marks it delivered", async () => {
    const socket = await registered();
    const store = useAppStore.getState();
    store.addScannedTag({
      uid: "04:A2",
      technology: "ISO14443A",
      type: "NTAG",
      scannedAt: new Date(),
      sentToServer: false,
    });

    websocketService.sendTagScanned({
      uid: "04:A2",
      technology: "ISO14443A",
      type: "NTAG",
      scannedAt: new Date().toISOString(),
    });

    expect(socket.lastMessage()).toMatchObject({
      type: "tagScanned",
      payload: { uid: "04:A2", deviceID: "device-123" },
    });
    expect(useAppStore.getState().nfc.scanHistory[0].sentToServer).toBe(true);
  });

  it("does not claim a scan was delivered when the socket is gone", async () => {
    const socket = await registered();
    const store = useAppStore.getState();
    store.addScannedTag({
      uid: "04:A2",
      technology: "ISO14443A",
      type: "NTAG",
      scannedAt: new Date(),
      sentToServer: false,
    });

    socket.readyState = FakeWebSocket.CLOSED;
    websocketService.sendTagScanned({
      uid: "04:A2",
      technology: "ISO14443A",
      type: "NTAG",
      scannedAt: new Date().toISOString(),
    });

    expect(useAppStore.getState().nfc.scanHistory[0].sentToServer).toBe(false);
  });

  it("says goodbye before an intentional disconnect", async () => {
    const socket = await registered();
    websocketService.disconnect();

    expect(socket.lastMessage()).toMatchObject({
      type: "goodbye",
      payload: { deviceID: "device-123" },
    });
  });
});

describe("agent errors outside a request", () => {
  it("records the error without tearing down a working connection", async () => {
    const socket = await openConnection();
    const registering = websocketService.registerDevice();
    await tick();
    registrationResponse(socket);
    await registering;

    socket.reply({
      type: "error",
      success: false,
      error: "Tag left the field",
      payload: { code: "TAG_REMOVED", retryable: true },
    });

    const { connection } = useAppStore.getState();
    expect(connection.error).toBe("Tag left the field");
    expect(connection.status).toBe("registered");
  });
});
