import { Platform } from "react-native";
import NfcManager, { Ndef, NfcEvents } from "react-native-nfc-manager";
import { useAppStore } from "@/stores";

jest.mock("@/constants/config", () => {
  const actual = jest.requireActual("@/constants/config");
  return { ...actual, TAG_DEDUPE_WINDOW: 50 };
});

jest.mock("@/services/websocket", () => ({
  websocketService: {
    isRegistered: jest.fn(() => false),
    sendTagScanned: jest.fn(),
    sendTagRemoved: jest.fn(),
    setWriteHandler: jest.fn(),
    setTransceiveHandler: jest.fn(),
  },
}));

 
const { nfcService } = require("@/services/nfc");
 
const { websocketService } = require("@/services/websocket");

const manager = NfcManager as jest.Mocked<typeof NfcManager>;

// Captured once, because resetting mocks between tests would otherwise erase
// the registration the service made when the reader started.
let tagListener: (tag: unknown) => Promise<void>;
// Captured for the same reason as the tag listener: these are registered once
// during init, and clearAllMocks between tests would erase the record of it.
let registeredWriteHandler: unknown;
let registeredTransceiveHandler: unknown;

/** The listener the service handed to the NFC manager. */
function discoverTag(): (tag: unknown) => Promise<void> {
  if (!tagListener) {
    throw new Error("The service never registered a tag listener");
  }
  return tagListener;
}

const rawTag = (id: number[]) => ({ id, techTypes: ["android.nfc.tech.NfcA"] });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  await nfcService.init();
  await nfcService.enableForegroundDispatch();

  const registration = (manager.setEventListener as jest.Mock).mock.calls
    .filter(([event, handler]) => event === NfcEvents.DiscoverTag && handler)
    .pop();
  tagListener = registration?.[1];

  registeredWriteHandler = (websocketService.setWriteHandler as jest.Mock).mock.calls.at(-1)?.[0];
  registeredTransceiveHandler = (
    websocketService.setTransceiveHandler as jest.Mock
  ).mock.calls.at(-1)?.[0];
});

beforeEach(() => {
  // The service is a singleton, so its dedupe memory has to be cleared or one
  // test's scan makes the next one's look like a repeat.
  (websocketService.isRegistered as jest.Mock).mockReturnValue(false);
  nfcService.clearLastTag();
  useAppStore.getState().reset();
  jest.clearAllMocks();
  (websocketService.isRegistered as jest.Mock).mockReturnValue(false);
});

describe("init", () => {
  it("registers the handlers the agent drives this device through", () => {
    // Registered during init, so a failure here is quiet: the throw would be
    // swallowed by init's own catch and surface only as requests never arriving.
    expect(typeof registeredWriteHandler).toBe("function");
    expect(typeof registeredTransceiveHandler).toBe("function");
  });

  it("starts the manager once however many callers ask", async () => {
    const before = (manager.start as jest.Mock).mock.calls.length;

    await Promise.all([nfcService.init(), nfcService.init(), nfcService.init()]);

    expect((manager.start as jest.Mock).mock.calls.length).toBe(before);
  });
});

describe("discovering tags", () => {
  it("records a scan and keeps it as the last tag", async () => {
    await discoverTag()(rawTag([0x04, 0xa2]));

    const { scanHistory, lastTag } = useAppStore.getState().nfc;
    expect(scanHistory).toHaveLength(1);
    expect(lastTag?.uid).toBe("04:A2");
  });

  it("ignores a tag that is only being re-read while it sits in the field", async () => {
    const handle = discoverTag();
    await handle(rawTag([0x04, 0xa2]));
    await handle(rawTag([0x04, 0xa2]));
    await handle(rawTag([0x04, 0xa2]));

    expect(useAppStore.getState().nfc.scanHistory).toHaveLength(1);
  });

  it("treats the same tag as a new scan once it has been away", async () => {
    const handle = discoverTag();
    await handle(rawTag([0x04, 0xa2]));
    await sleep(60);
    await handle(rawTag([0x04, 0xa2]));

    expect(useAppStore.getState().nfc.scanHistory).toHaveLength(2);
  });

  it("does not confuse two different tags for a repeat", async () => {
    const handle = discoverTag();
    await handle(rawTag([0x04, 0xa2]));
    await handle(rawTag([0x0b, 0x00]));

    expect(useAppStore.getState().nfc.scanHistory).toHaveLength(2);
  });

  it("drops tags entirely while processing is paused", async () => {
    useAppStore.getState().setProcessingEnabled(false);
    await discoverTag()(rawTag([0x04, 0xa2]));

    expect(useAppStore.getState().nfc.scanHistory).toHaveLength(0);
    expect(websocketService.sendTagScanned).not.toHaveBeenCalled();
  });

  it("forwards the scan when the agent is listening", async () => {
    (websocketService.isRegistered as jest.Mock).mockReturnValue(true);
    await discoverTag()(rawTag([0x04, 0xa2]));

    expect(websocketService.sendTagScanned).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "04:A2", technology: "ISO14443A" })
    );
  });

  it("keeps the scan locally when nothing is listening", async () => {
    await discoverTag()(rawTag([0x04, 0xa2]));

    expect(websocketService.sendTagScanned).not.toHaveBeenCalled();
    expect(useAppStore.getState().nfc.scanHistory[0].sentToServer).toBe(false);
  });
});

describe("clearLastTag", () => {
  it("tells the agent the tag is gone and drops it locally", async () => {
    (websocketService.isRegistered as jest.Mock).mockReturnValue(true);
    await discoverTag()(rawTag([0x04, 0xa2]));

    nfcService.clearLastTag();

    expect(websocketService.sendTagRemoved).toHaveBeenCalledWith("04:A2");
    expect(useAppStore.getState().nfc.lastTag).toBeNull();
  });

  it("lets the same tag be scanned again straight away", async () => {
    const handle = discoverTag();
    await handle(rawTag([0x04, 0xa2]));
    nfcService.clearLastTag();
    await handle(rawTag([0x04, 0xa2]));

    expect(useAppStore.getState().nfc.scanHistory).toHaveLength(2);
  });

  it("says nothing to an agent that is not listening", () => {
    nfcService.clearLastTag();
    expect(websocketService.sendTagRemoved).not.toHaveBeenCalled();
  });
});

describe("processing toggle", () => {
  it("flips and reports the new state", () => {
    expect(nfcService.toggleProcessing()).toBe(false);
    expect(useAppStore.getState().nfc.processingEnabled).toBe(false);
    expect(nfcService.toggleProcessing()).toBe(true);
  });
});

describe("checkEnabled", () => {
  it("writes the adapter's current state into the store", async () => {
    (manager.isEnabled as jest.Mock).mockResolvedValueOnce(false);

    await expect(nfcService.checkEnabled()).resolves.toBe(false);
    expect(useAppStore.getState().nfc.isEnabled).toBe(false);
  });
});

describe("writing tags", () => {
  const ndefBytes = () => Buffer.from([0xd1, 0x01, 0x01, 0x54, 0x02]).toString("base64");

  const originalOS = Platform.OS;
  const setPlatform = (os: "ios" | "android") =>
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });

  // Writing is Android-only, so these run as Android unless a test says otherwise.
  beforeEach(() => setPlatform("android"));
  afterAll(() => setPlatform(originalOS as "ios" | "android"));

  /** Put a tag in the field so a write has something to target. */
  async function presentTag(id: number[]): Promise<string> {
    await discoverTag()(rawTag(id));
    const uid = useAppStore.getState().nfc.lastTag?.uid;
    if (!uid) {
      throw new Error("The scan did not register a tag");
    }
    return uid;
  }

  it("writes the encoded bytes the agent supplied", async () => {
    const uid = await presentTag([0x04, 0xb1]);

    const result = await nfcService.handleWriteRequest("req_1", {
      requestID: "req_1",
      deviceID: "dev",
      tagUID: uid,
      ndefBytes: ndefBytes(),
    });

    expect(result).toEqual({ requestID: "req_1", success: true });
    expect(manager.ndefHandler.writeNdefMessage).toHaveBeenCalledWith([
      0xd1, 0x01, 0x01, 0x54, 0x02,
    ]);
    // The reader-mode registration is reused, so cancelling must not unregister it.
    expect(manager.unregisterTagEvent).not.toHaveBeenCalled();
  });

  it("prefers ndefBytes over the record form when both are sent", async () => {
    const uid = await presentTag([0x04, 0xb2]);

    await nfcService.handleWriteRequest("req_2", {
      requestID: "req_2",
      deviceID: "dev",
      tagUID: uid,
      ndefBytes: ndefBytes(),
      ndefMessage: { records: [{ recordType: "text", content: "ignored" }] },
    });

    expect(manager.ndefHandler.writeNdefMessage).toHaveBeenCalledWith([
      0xd1, 0x01, 0x01, 0x54, 0x02,
    ]);
  });

  it("locks the tag only when asked", async () => {
    const uid = await presentTag([0x04, 0xb3]);

    await nfcService.handleWriteRequest("req_3", {
      requestID: "req_3",
      deviceID: "dev",
      tagUID: uid,
      ndefBytes: ndefBytes(),
    });
    expect(manager.ndefHandler.makeReadOnly).not.toHaveBeenCalled();

    await nfcService.handleWriteRequest("req_4", {
      requestID: "req_4",
      deviceID: "dev",
      tagUID: uid,
      ndefBytes: ndefBytes(),
      lock: true,
    });
    expect(manager.ndefHandler.makeReadOnly).toHaveBeenCalled();
  });

  it("refuses a write aimed at a tag that is no longer the one present", async () => {
    await presentTag([0x04, 0xb4]);

    const result = await nfcService.handleWriteRequest("req_5", {
      requestID: "req_5",
      deviceID: "dev",
      tagUID: "DE:AD:BE:EF",
      ndefBytes: ndefBytes(),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TAG_REMOVED");
    expect(manager.ndefHandler.writeNdefMessage).not.toHaveBeenCalled();
  });

  it("refuses a write with no tag in the field", async () => {
    const result = await nfcService.handleWriteRequest("req_6", {
      requestID: "req_6",
      deviceID: "dev",
      ndefBytes: ndefBytes(),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TAG_NOT_CONNECTED");
    expect(manager.ndefHandler.writeNdefMessage).not.toHaveBeenCalled();
  });

  it("reports a locked tag as READ_ONLY rather than a bare failure", async () => {
    const uid = await presentTag([0x04, 0xb5]);
    (manager.ndefHandler.writeNdefMessage as jest.Mock).mockRejectedValueOnce(
      new Error("Tag is read-only")
    );

    const result = await nfcService.handleWriteRequest("req_7", {
      requestID: "req_7",
      deviceID: "dev",
      tagUID: uid,
      ndefBytes: ndefBytes(),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("READ_ONLY");
  });

  it("falls back to the record form when the agent sends no encoded bytes", async () => {
    const uid = await presentTag([0x04, 0xb8]);

    const result = await nfcService.handleWriteRequest("req_10", {
      requestID: "req_10",
      deviceID: "dev",
      tagUID: uid,
      ndefMessage: { records: [{ recordType: "text", content: "hello", language: "en" }] },
    });

    expect(result.success).toBe(true);
    expect(Ndef.textRecord).toHaveBeenCalledWith("hello", "en");
    expect(manager.ndefHandler.writeNdefMessage).toHaveBeenCalled();
  });

  it("refuses to write on iOS, where the session model cannot support it", async () => {
    const uid = await presentTag([0x04, 0xb7]);
    setPlatform("ios");

    const result = await nfcService.handleWriteRequest("req_9", {
      requestID: "req_9",
      deviceID: "dev",
      tagUID: uid,
      ndefBytes: ndefBytes(),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("NOT_SUPPORTED");
    expect(manager.ndefHandler.writeNdefMessage).not.toHaveBeenCalled();
  });

  it("refuses a request carrying neither bytes nor a usable record", async () => {
    const uid = await presentTag([0x04, 0xb6]);

    const result = await nfcService.handleWriteRequest("req_8", {
      requestID: "req_8",
      deviceID: "dev",
      tagUID: uid,
      ndefMessage: { records: [{ content: "no type at all" }] },
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_DATA");
    expect(manager.ndefHandler.writeNdefMessage).not.toHaveBeenCalled();
  });
});

describe("transceiving with tags", () => {
  const command = () => Buffer.from([0x00, 0xa4, 0x04, 0x00]).toString("base64");

  const originalOS = Platform.OS;
  const setPlatform = (os: "ios" | "android") =>
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });

  beforeEach(() => setPlatform("android"));
  afterAll(() => setPlatform(originalOS as "ios" | "android"));

  async function presentTag(id: number[]): Promise<string> {
    await discoverTag()(rawTag(id));
    const uid = useAppStore.getState().nfc.lastTag?.uid;
    if (!uid) {
      throw new Error("The scan did not register a tag");
    }
    return uid;
  }

  it("exchanges APDUs over IsoDep and returns the reply", async () => {
    const uid = await presentTag([0x04, 0xc1]);

    const result = await nfcService.handleTransceiveRequest("t1", {
      requestID: "t1",
      deviceID: "dev",
      tagUID: uid,
      data: command(),
    });

    expect(manager.requestTechnology).toHaveBeenCalledWith("IsoDep");
    expect(manager.isoDepHandler.transceive).toHaveBeenCalledWith([0x00, 0xa4, 0x04, 0x00]);
    // 0x9000 base64-encoded — the tag's reply, handed back as the agent expects.
    expect(result).toEqual({ requestID: "t1", success: true, data: "kAA=" });
  });

  it("uses framing-level exchange when the agent asks for raw", async () => {
    const uid = await presentTag([0x04, 0xc2]);

    const result = await nfcService.handleTransceiveRequest("t2", {
      requestID: "t2",
      deviceID: "dev",
      tagUID: uid,
      data: command(),
      raw: true,
    });

    expect(manager.requestTechnology).toHaveBeenCalledWith("NfcA");
    expect(manager.nfcAHandler.transceive).toHaveBeenCalled();
    expect(manager.isoDepHandler.transceive).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("refuses an exchange aimed at a tag that is no longer present", async () => {
    await presentTag([0x04, 0xc3]);

    const result = await nfcService.handleTransceiveRequest("t3", {
      requestID: "t3",
      deviceID: "dev",
      tagUID: "DE:AD:BE:EF",
      data: command(),
    });

    expect(result.errorCode).toBe("TAG_REMOVED");
    expect(manager.isoDepHandler.transceive).not.toHaveBeenCalled();
  });

  it("reports a tag that does not speak the technology as TAG_NOT_CONNECTED", async () => {
    const uid = await presentTag([0x04, 0xc4]);
    (manager.requestTechnology as jest.Mock).mockRejectedValueOnce(new Error("tech not available"));

    const result = await nfcService.handleTransceiveRequest("t4", {
      requestID: "t4",
      deviceID: "dev",
      tagUID: uid,
      data: command(),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TAG_NOT_CONNECTED");
  });

  it("gives up on its own deadline rather than racing the agent's", async () => {
    const uid = await presentTag([0x04, 0xc5]);
    (manager.isoDepHandler.transceive as jest.Mock).mockReturnValueOnce(new Promise(() => {}));

    const result = await nfcService.handleTransceiveRequest("t5", {
      requestID: "t5",
      deviceID: "dev",
      tagUID: uid,
      data: command(),
      timeoutMs: 20,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TIMEOUT");
    // The session is still closed, or the reader would be left holding it.
    expect(manager.cancelTechnologyRequest).toHaveBeenCalled();
  });

  it("refuses on iOS, where the session model cannot support it", async () => {
    const uid = await presentTag([0x04, 0xc6]);
    setPlatform("ios");

    const result = await nfcService.handleTransceiveRequest("t6", {
      requestID: "t6",
      deviceID: "dev",
      tagUID: uid,
      data: command(),
    });

    expect(result.errorCode).toBe("NOT_SUPPORTED");
    expect(manager.isoDepHandler.transceive).not.toHaveBeenCalled();
  });
});
