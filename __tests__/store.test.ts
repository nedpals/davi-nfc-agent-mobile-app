import { mergePersisted, useAppStore } from "@/stores";
import { HISTORY_LIMIT } from "@/constants/config";
import type { ScannedTag } from "@/types/protocol";

const tag = (uid: string, overrides: Partial<ScannedTag> = {}): ScannedTag => ({
  uid,
  technology: "ISO14443A",
  type: "NTAG",
  scannedAt: new Date("2026-01-01T12:00:00Z"),
  sentToServer: false,
  ...overrides,
});

beforeEach(() => {
  useAppStore.getState().reset();
});

describe("connection state", () => {
  it("records an agent error without dropping a live connection", () => {
    const store = useAppStore.getState();
    store.setConnectionStatus("registered");
    store.setConnectionError("TAG_REMOVED");

    const { connection } = useAppStore.getState();
    expect(connection.error).toBe("TAG_REMOVED");
    expect(connection.status).toBe("registered");
  });

  it("enters the error state only when the connection actually failed", () => {
    useAppStore.getState().failConnection("Could not reach the agent");

    const { connection } = useAppStore.getState();
    expect(connection.status).toBe("error");
    expect(connection.error).toBe("Could not reach the agent");
  });
});

describe("disconnect", () => {
  it("keeps what the device knows and forgets only the session", () => {
    const store = useAppStore.getState();
    const pairing = {
      host: "192.168.1.5",
      agentPort: 9470,
      deviceID: "device-1",
      publicKeyPin: "sha256/abc",
      keySource: "qr" as const,
    };

    store.setServerUrl("192.168.1.5:9470");
    store.setApiSecret("secret");
    store.setPairing(pairing);
    store.setPinningState("pinned");
    store.setDeviceId("session-device-id");
    store.setRegistered(true);
    store.setConnectionStatus("registered");

    store.disconnect();

    const { connection, device } = useAppStore.getState();
    expect(connection.status).toBe("disconnected");
    expect(connection.serverUrl).toBe("192.168.1.5:9470");
    expect(connection.apiSecret).toBe("secret");
    expect(connection.pairing).toEqual(pairing);
    expect(connection.pinningState).toBe("pinned");
    // Nothing should auto-reconnect to an agent the user just left.
    expect(connection.manualDisconnect).toBe(true);
    // Device identity is per-connection and the agent mints a new one.
    expect(device.deviceId).toBeNull();
    expect(device.isRegistered).toBe(false);
  });
});

describe("scan history", () => {
  it("keeps the newest scan first and caps what it holds", () => {
    const store = useAppStore.getState();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      store.addScannedTag(tag(`UID-${i}`));
    }

    const { scanHistory, lastTag } = useAppStore.getState().nfc;
    expect(scanHistory).toHaveLength(HISTORY_LIMIT);
    expect(scanHistory[0].uid).toBe(`UID-${HISTORY_LIMIT + 9}`);
    expect(lastTag?.uid).toBe(`UID-${HISTORY_LIMIT + 9}`);
  });

  it("marks only the newest read of a UID as sent", () => {
    const store = useAppStore.getState();
    store.addScannedTag(tag("AA:BB"));
    store.addScannedTag(tag("CC:DD"));
    store.addScannedTag(tag("AA:BB"));

    store.markTagSent("AA:BB");

    const { scanHistory, lastTag } = useAppStore.getState().nfc;
    expect(scanHistory.map((entry) => entry.sentToServer)).toEqual([true, false, false]);
    expect(lastTag?.sentToServer).toBe(true);
  });

  it("leaves history untouched when the UID is not there", () => {
    const store = useAppStore.getState();
    store.addScannedTag(tag("AA:BB"));
    store.markTagSent("ZZ:ZZ");

    expect(useAppStore.getState().nfc.scanHistory[0].sentToServer).toBe(false);
  });

  it("clears the last tag along with the history", () => {
    const store = useAppStore.getState();
    store.addScannedTag(tag("AA:BB"));
    store.clearScanHistory();

    const { scanHistory, lastTag } = useAppStore.getState().nfc;
    expect(scanHistory).toEqual([]);
    expect(lastTag).toBeNull();
  });
});

describe("agent-driven operations", () => {
  it("publishes an operation while it runs", () => {
    const store = useAppStore.getState();
    store.startTagOperation({ kind: "write", tagUID: "AA:BB" });

    expect(useAppStore.getState().nfc.operation).toMatchObject({
      kind: "write",
      tagUID: "AA:BB",
      status: "running",
    });
  });

  it("keeps the outcome on the scan the operation applied to", () => {
    const store = useAppStore.getState();
    store.addScannedTag(tag("AA:BB"));
    store.startTagOperation({ kind: "write", tagUID: "AA:BB" });
    store.finishTagOperation({ status: "succeeded" });

    const { operation, scanHistory, lastTag } = useAppStore.getState().nfc;
    expect(operation).toMatchObject({ status: "succeeded" });
    expect(operation?.finishedAt).toBeInstanceOf(Date);
    expect(scanHistory[0].operations).toEqual([
      { kind: "write", succeeded: true, at: expect.any(Date) },
    ]);
    // The drawer reads the live tag, so it has to carry the outcome too.
    expect(lastTag?.operations).toHaveLength(1);
  });

  it("records a failure against the tag with the agent's reason", () => {
    const store = useAppStore.getState();
    store.addScannedTag(tag("AA:BB"));
    store.startTagOperation({ kind: "write", tagUID: "AA:BB" });
    store.finishTagOperation({ status: "failed", error: "The tag is read-only", errorCode: "READ_ONLY" });

    const { operation, scanHistory } = useAppStore.getState().nfc;
    expect(operation).toMatchObject({ errorCode: "READ_ONLY", error: "The tag is read-only" });
    expect(scanHistory[0].operations).toEqual([
      { kind: "write", succeeded: false, at: expect.any(Date) },
    ]);
  });

  it("holds an operation the agent asked for when no tag was present", () => {
    const store = useAppStore.getState();
    store.startTagOperation({ kind: "write", tagUID: null });
    store.finishTagOperation({ status: "failed", errorCode: "TAG_NOT_CONNECTED" });

    expect(useAppStore.getState().nfc.operation).toMatchObject({
      tagUID: null,
      status: "failed",
    });
  });

  it("ignores an outcome for an operation that was never started", () => {
    useAppStore.getState().finishTagOperation({ status: "succeeded" });
    expect(useAppStore.getState().nfc.operation).toBeNull();
  });

  it("clears the operation once it has been shown", () => {
    const store = useAppStore.getState();
    store.startTagOperation({ kind: "write", tagUID: "AA:BB" });
    store.clearTagOperation();

    expect(useAppStore.getState().nfc.operation).toBeNull();
  });
});

describe("discovery", () => {
  const server = (name: string) => ({
    name,
    host: `${name}.local`,
    port: 9470,
    addresses: ["192.168.1.5"],
    txtRecords: {},
  });

  it("replaces a server that is resolved again rather than listing it twice", () => {
    const store = useAppStore.getState();
    store.addDiscoveredServer(server("agent"));
    store.addDiscoveredServer({ ...server("agent"), port: 9999 });

    const { discoveredServers } = useAppStore.getState().discovery;
    expect(discoveredServers).toHaveLength(1);
    expect(discoveredServers[0].port).toBe(9999);
  });

  it("drops the selection when the selected server goes away", () => {
    const store = useAppStore.getState();
    store.addDiscoveredServer(server("agent"));
    store.selectServer(server("agent"));
    store.removeDiscoveredServer("agent");

    const { discoveredServers, selectedServer } = useAppStore.getState().discovery;
    expect(discoveredServers).toEqual([]);
    expect(selectedServer).toBeNull();
  });
});

describe("mergePersisted", () => {
  const current = () => useAppStore.getState();

  it("fills a partialized slice from the defaults instead of blanking it", () => {
    const merged = mergePersisted(
      { connection: { serverUrl: "192.168.1.5:9470", apiSecret: "secret" } },
      current()
    );

    expect(merged.connection.serverUrl).toBe("192.168.1.5:9470");
    expect(merged.connection.status).toBe("disconnected");
    expect(merged.connection.pinningState).toBe("not-applicable");
    expect(merged.nfc.processingEnabled).toBe(true);
    expect(merged.device.platform).toMatch(/ios|android/);
    expect(typeof merged.setConnectionStatus).toBe("function");
  });

  it("revives dates that JSON turned into strings", () => {
    const merged = mergePersisted(
      {
        connection: { lastConnected: "2026-01-01T12:00:00.000Z" },
        nfc: {
          scanHistory: [
            { uid: "AA:BB", technology: "ISO14443A", type: "NTAG", scannedAt: "2026-01-01T12:00:00.000Z", sentToServer: true },
          ],
        },
      },
      current()
    );

    expect(merged.connection.lastConnected).toBeInstanceOf(Date);
    expect(merged.nfc.scanHistory[0].scannedAt).toBeInstanceOf(Date);
    expect(merged.nfc.scanHistory[0].sentToServer).toBe(true);
  });

  it("discards history entries that cannot be trusted", () => {
    const merged = mergePersisted(
      {
        nfc: {
          scanHistory: [
            { uid: "AA:BB", scannedAt: "2026-01-01T12:00:00.000Z" },
            { uid: "CC:DD", scannedAt: "not a date" },
            { scannedAt: "2026-01-01T12:00:00.000Z" },
            null,
          ],
        },
      },
      current()
    );

    expect(merged.nfc.scanHistory).toHaveLength(1);
    expect(merged.nfc.scanHistory[0]).toMatchObject({
      uid: "AA:BB",
      technology: "Unknown",
      sentToServer: false,
    });
  });

  it("revives the operations kept against a scan", () => {
    const merged = mergePersisted(
      {
        nfc: {
          scanHistory: [
            {
              uid: "AA:BB",
              scannedAt: "2026-01-01T12:00:00.000Z",
              operations: [
                { kind: "write", succeeded: true, at: "2026-01-01T12:00:05.000Z" },
                { kind: "transceive", succeeded: false, at: "not a date" },
                { kind: "nonsense", succeeded: true, at: "2026-01-01T12:00:06.000Z" },
              ],
            },
          ],
        },
      },
      current()
    );

    const operations = merged.nfc.scanHistory[0].operations;
    expect(operations).toHaveLength(1);
    expect(operations![0]).toMatchObject({ kind: "write", succeeded: true });
    expect(operations![0].at).toBeInstanceOf(Date);
  });

  it("does not restore an operation that was running when the app closed", () => {
    const merged = mergePersisted({ nfc: { scanHistory: [] } }, current());
    expect(merged.nfc.operation).toBeNull();
  });

  it("starts a session disconnected, unregistered and searching nothing", () => {
    const merged = mergePersisted(
      {
        connection: { serverUrl: "192.168.1.5:9470" },
        device: { deviceName: "Kiosk phone" },
      },
      current()
    );

    expect(merged.device.deviceName).toBe("Kiosk phone");
    expect(merged.device.deviceId).toBeNull();
    expect(merged.device.isRegistered).toBe(false);
    expect(merged.connection.manualDisconnect).toBe(false);
    expect(merged.nfc.isActive).toBe(false);
    expect(merged.nfc.lastTag).toBeNull();
    expect(merged.discovery.discoveredServers).toEqual([]);
  });

  it("survives an empty or missing payload", () => {
    expect(mergePersisted(undefined, current()).connection.status).toBe("disconnected");
    expect(mergePersisted({}, current()).nfc.scanHistory).toEqual([]);
  });
});
