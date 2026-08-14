import NfcManager, { NfcEvents } from "react-native-nfc-manager";
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
  },
}));

 
const { nfcService } = require("@/services/nfc");
 
const { websocketService } = require("@/services/websocket");

const manager = NfcManager as jest.Mocked<typeof NfcManager>;

// Captured once, because resetting mocks between tests would otherwise erase
// the registration the service made when the reader started.
let tagListener: (tag: unknown) => Promise<void>;

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
