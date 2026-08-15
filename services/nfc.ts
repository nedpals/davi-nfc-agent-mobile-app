import { TAG_DEDUPE_WINDOW } from "@/constants/config";
import { useAppStore } from "@/stores";
import type { ScannedTag } from "@/types/protocol";
import * as Haptics from "expo-haptics";
import { AppState, type AppStateStatus, Platform } from "react-native";
import NfcManager, { Ndef, NfcAdapter, NfcEvents, NfcTech } from "react-native-nfc-manager";
import {
  base64ToBytes,
  base64ToString,
  bytesToBase64,
  processTag,
  type RawNfcTag,
} from "./nfc-parsing";
import { websocketService } from "./websocket";
import type {
  DeviceErrorCode,
  DeviceTransceiveRequestPayload,
  DeviceTransceiveResponsePayload,
  DeviceWriteRequestPayload,
  DeviceWriteResponsePayload,
  NDEFRecordInput,
} from "@/types/protocol";

export interface NFCInitResult {
  supported: boolean;
  enabled: boolean;
}

/** An outcome the agent can act on, rather than an opaque failure. */
export class NFCOperationError extends Error {
  readonly code: DeviceErrorCode;

  constructor(message: string, code: DeviceErrorCode) {
    super(message);
    this.name = "NFCOperationError";
    this.code = code;
  }
}

function describeNfcError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "The NFC operation failed";
}

/**
 * Turn a write request into the bytes to put on the tag.
 *
 * `ndefBytes` is preferred and is what the agent calls authoritative where the
 * two forms disagree — it is the message the agent already encoded, so nothing
 * is lost in translation. The record form is a fallback for agents that send
 * only records, and covers the two types they can express faithfully.
 */
function encodeWritePayload(payload: DeviceWriteRequestPayload): number[] {
  if (payload.ndefBytes) {
    return base64ToBytes(payload.ndefBytes);
  }

  const records = payload.ndefMessage?.records ?? [];
  if (records.length === 0) {
    return Ndef.encodeMessage([Ndef.record(Ndef.TNF_EMPTY, "", "", [])]);
  }

  return Ndef.encodeMessage(records.map(toNdefRecord));
}

/** TNF is three bits, so anything outside 0-7 is not a record we can build. */
function toTnf(value: number): 0x0 | 0x01 | 0x02 | 0x03 | 0x04 | 0x05 | 0x06 | 0x07 {
  if (!Number.isInteger(value) || value < 0 || value > 7) {
    throw new Error(`Cannot encode record: TNF ${value} is out of range`);
  }
  return value as 0x0 | 0x01 | 0x02 | 0x03 | 0x04 | 0x05 | 0x06 | 0x07;
}

function toNdefRecord(record: NDEFRecordInput) {
  switch (record.recordType) {
    case "text":
      return Ndef.textRecord(record.content ?? "", record.language ?? "en");
    case "uri":
      return Ndef.uriRecord(record.content ?? "");
    case "mime":
      return Ndef.record(
        Ndef.TNF_MIME_MEDIA,
        record.mimeType ?? "application/octet-stream",
        record.id ? base64ToBytes(record.id) : [],
        record.payload ? base64ToBytes(record.payload) : [],
      );
    default:
      // The low-level form carries everything needed to build the record
      // as-is; without a TNF there is nothing to build from.
      if (record.tnf === undefined) {
        throw new Error(
          "Cannot encode record: neither ndefBytes nor a usable record type was supplied",
        );
      }
      return Ndef.record(
        toTnf(record.tnf),
        record.type ? base64ToString(record.type) : "",
        record.id ? base64ToBytes(record.id) : [],
        record.payload ? base64ToBytes(record.payload) : [],
      );
  }
}

/**
 * Map what the platform reports onto the agent's taxonomy.
 *
 * The library surfaces most failures as a message rather than a code, so this
 * reads the text. An unrecognised failure stays WRITE_FAILED, which the agent
 * treats as retryable — the honest answer when the cause is unknown.
 */
function classifyWriteError(error: unknown): DeviceErrorCode {
  const message = describeNfcError(error).toLowerCase();

  if (message.includes("read-only") || message.includes("read only")) {
    return "READ_ONLY";
  }
  if (message.includes("not enough space") || message.includes("too large")) {
    return "CAPACITY_EXCEEDED";
  }
  if (message.includes("tag was lost") || message.includes("connection lost")) {
    return "TAG_REMOVED";
  }
  if (message.includes("not supported") || message.includes("not ndef")) {
    return "NOT_SUPPORTED";
  }
  return "WRITE_FAILED";
}

/** Same shape as classifyWriteError, for the failures an exchange reports. */
function classifyTransceiveError(error: unknown): DeviceErrorCode {
  const message = describeNfcError(error).toLowerCase();

  if (message.includes("tag was lost") || message.includes("connection lost")) {
    return "TAG_REMOVED";
  }
  if (message.includes("not supported") || message.includes("tech")) {
    return "NOT_SUPPORTED";
  }
  return "TRANSCEIVE_FAILED";
}

/**
 * Fail an exchange that outlives its budget.
 *
 * The underlying call has no cancel, so the losing promise is left to settle on
 * its own; what matters is that the caller stops waiting when it said it would.
 */
function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new NFCOperationError(`Exchange exceeded ${timeoutMs}ms`, "TIMEOUT"));
    }, timeoutMs);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class NFCService {
  private static instance: NFCService;
  private isInitialized = false;
  private initPromise: Promise<NFCInitResult> | null = null;
  private isForegroundActive = false;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private onTagDiscovered: ((tag: ScannedTag) => void) | null = null;
  private lastAccepted: { uid: string; at: number } | null = null;

  private constructor() {}

  static getInstance(): NFCService {
    if (!NFCService.instance) {
      NFCService.instance = new NFCService();
    }
    return NFCService.instance;
  }

  /**
   * Both the root layout and the scanner screen ask for NFC on mount, so the
   * work is shared rather than repeated: starting the manager twice leaves the
   * second caller talking to a half-configured adapter.
   */
  async init(): Promise<NFCInitResult> {
    if (!this.initPromise) {
      this.initPromise = this.performInit();
    }
    return this.initPromise;
  }

  private async performInit(): Promise<NFCInitResult> {
    const store = useAppStore.getState();

    try {
      const supported = await NfcManager.isSupported();
      store.setNFCSupported(supported);

      if (!supported) {
        store.setNFCEnabled(false);
        return { supported: false, enabled: false };
      }

      await NfcManager.start();
      this.isInitialized = true;

      const enabled = await NfcManager.isEnabled();
      store.setNFCEnabled(enabled);

      this.setupAppStateListener();

      // Registered here rather than at module scope, and from this side rather
      // than the socket layer importing this one: that direction would close a
      // cycle, since this module already depends on that one to send what it
      // scans.
      websocketService.setWriteHandler((requestID, payload) =>
        this.handleWriteRequest(requestID, payload)
      );
      websocketService.setTransceiveHandler((requestID, payload) =>
        this.handleTransceiveRequest(requestID, payload)
      );

      return { supported, enabled };
    } catch (error) {
      console.error("[NFC] Initialization failed:", error);
      store.setNFCSupported(false);
      store.setNFCEnabled(false);
      return { supported: false, enabled: false };
    }
  }

  private setupAppStateListener(): void {
    if (this.appStateSubscription) {
      return;
    }

    this.appStateSubscription = AppState.addEventListener("change", (next) => {
      this.handleAppStateChange(next).catch((error) =>
        console.error("[NFC] App state handling failed:", error)
      );
    });
  }

  private async handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    // "inactive" is transitional — a notification shade or the app switcher —
    // and tearing down the reader there costs a scan on the way back.
    if (nextAppState === "active") {
      // NFC may have been switched on in system settings while the app was
      // away, which nothing else would tell us about.
      const enabled = await this.checkEnabled();
      if (enabled && !this.isForegroundActive) {
        await this.enableForegroundDispatch();
      }
    } else if (nextAppState === "background") {
      await this.disableForegroundDispatch();
    }
  }

  async enableForegroundDispatch(): Promise<void> {
    if (!this.isInitialized) {
      console.error("[NFC] Service not initialized");
      return;
    }

    const store = useAppStore.getState();

    if (this.isForegroundActive) {
      // Re-assert it rather than returning silently: the reader is running, and
      // a store that says otherwise leaves the UI disabled with no way back.
      store.setNFCActive(true);
      return;
    }


    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, this.handleDiscoveredTag.bind(this));

      // Reader mode takes NFC away from the OS, so tags land here instead of
      // raising the system's own tag handler.
      await NfcManager.registerTagEvent({
        isReaderModeEnabled: true,
        readerModeFlags:
          NfcAdapter.FLAG_READER_NFC_A |
          NfcAdapter.FLAG_READER_NFC_B |
          NfcAdapter.FLAG_READER_NFC_F |
          NfcAdapter.FLAG_READER_NFC_V |
          NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
        readerModeDelay: 20,
      });

      this.isForegroundActive = true;
      store.setNFCActive(true);
      console.log("[NFC] Reader mode active");
    } catch (error) {
      console.error("[NFC] Failed to enable foreground dispatch:", error);
      this.isForegroundActive = false;
      store.setNFCActive(false);
      throw error;
    }
  }

  async disableForegroundDispatch(): Promise<void> {
    if (!this.isForegroundActive) {
      return;
    }

    this.isForegroundActive = false;

    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      await NfcManager.unregisterTagEvent();
    } catch {
      // Already unregistered, which is the state we wanted.
    }

    useAppStore.getState().setNFCActive(false);
  }

  private async handleDiscoveredTag(tag: RawNfcTag): Promise<void> {
    const store = useAppStore.getState();

    if (!store.nfc.processingEnabled) {
      return;
    }

    try {
      const scannedTag = processTag(tag);
      if (!scannedTag) {
        return;
      }

      // Reader mode keeps reporting a tag that stays in the field, and each
      // repeat would otherwise become its own scan and its own frame.
      if (this.isRepeatPresentation(scannedTag)) {
        return;
      }

      store.addScannedTag(scannedTag);
      this.notifyScan();

      if (websocketService.isRegistered()) {
        websocketService.sendTagScanned({
          uid: scannedTag.uid,
          technology: scannedTag.technology,
          type: scannedTag.type,
          scannedAt: scannedTag.scannedAt.toISOString(),
          ndefMessage: scannedTag.ndefMessage,
        });
      }

      this.onTagDiscovered?.(scannedTag);
    } catch (error) {
      console.error("[NFC] Error processing discovered tag:", error);
    }
  }

  private isRepeatPresentation(tag: ScannedTag): boolean {
    const now = tag.scannedAt.getTime();
    const previous = this.lastAccepted;
    this.lastAccepted = { uid: tag.uid, at: now };

    return previous?.uid === tag.uid && now - previous.at < TAG_DEDUPE_WINDOW;
  }

  private notifyScan(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Haptics are a nicety; a device without them still scans.
    });
  }

  clearLastTag(): void {
    const store = useAppStore.getState();
    const lastTag = store.nfc.lastTag;

    if (lastTag && websocketService.isRegistered()) {
      websocketService.sendTagRemoved(lastTag.uid);
    }

    // Dismissing the tag means the next read of it is a new presentation, not
    // the tail of the one just cleared.
    this.lastAccepted = null;
    store.setLastTag(null);
  }

  setTagDiscoveredCallback(callback: ((tag: ScannedTag) => void) | null): void {
    this.onTagDiscovered = callback;
  }

  isForegroundDispatchActive(): boolean {
    return this.isForegroundActive;
  }

  toggleProcessing(): boolean {
    const store = useAppStore.getState();
    const next = !store.nfc.processingEnabled;
    store.setProcessingEnabled(next);
    return next;
  }

  setProcessingEnabled(enabled: boolean): void {
    useAppStore.getState().setProcessingEnabled(enabled);
  }

  async checkEnabled(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      const enabled = await NfcManager.isEnabled();
      useAppStore.getState().setNFCEnabled(enabled);
      return enabled;
    } catch {
      return false;
    }
  }

  /**
   * Whether this device can write a tag the agent asks it to.
   *
   * Android only. Writing needs a technology session over a tag already in the
   * field, which Android's reader mode provides; CoreNFC has no equivalent —
   * its sessions are user-initiated and modal, so an agent-driven write cannot
   * complete without the person presenting the tag to a system sheet.
   */
  canWrite(): boolean {
    return Platform.OS === "android";
  }

  /**
   * Whether this device can exchange raw commands with a tag.
   *
   * Android only, and for the same reason as writing: the exchange runs over a
   * technology session on a tag already in the field.
   */
  canTransceive(): boolean {
    return Platform.OS === "android";
  }

  /**
   * Write an encoded NDEF message to the tag currently in the field.
   *
   * `requestTechnology` reuses the reader-mode registration this service
   * already holds rather than opening one of its own, so the scan loop keeps
   * running and the matching cancel does not tear it down. That is why writing
   * does not have to stop and restart scanning.
   *
   * Throws a NFCOperationError carrying the agent's error code.
   */
  async writeNdef(bytes: number[], options: { lock?: boolean } = {}): Promise<void> {
    if (!this.canWrite()) {
      throw new NFCOperationError("This device cannot write tags", "NOT_SUPPORTED");
    }

    await this.withTechnology(NfcTech.Ndef, async () => {
      try {
        await NfcManager.ndefHandler.writeNdefMessage(bytes);

        if (options.lock) {
          await NfcManager.ndefHandler.makeReadOnly();
        }
      } catch (error) {
        throw new NFCOperationError(describeNfcError(error), classifyWriteError(error));
      }
    });
  }

  /**
   * Exchange raw bytes with the tag in the field and return its reply.
   *
   * `raw` selects framing-level exchange over APDU-level, which is a different
   * technology and so a different session — a tag that answers one may not
   * answer the other.
   */
  async transceive(
    bytes: number[],
    options: { raw?: boolean; timeoutMs?: number } = {},
  ): Promise<number[]> {
    if (!this.canTransceive()) {
      throw new NFCOperationError("This device cannot exchange raw commands", "NOT_SUPPORTED");
    }

    const tech = options.raw ? NfcTech.NfcA : NfcTech.IsoDep;

    return this.withTechnology(tech, async () => {
      const handler = options.raw ? NfcManager.nfcAHandler : NfcManager.isoDepHandler;

      try {
        const exchange = handler.transceive(bytes);
        // The agent allows itself a second longer than it asked for, so
        // honouring the deadline here is what makes it report the device's own
        // error rather than its own timeout.
        return options.timeoutMs
          ? await withDeadline(exchange, options.timeoutMs)
          : await exchange;
      } catch (error) {
        if (error instanceof NFCOperationError) {
          throw error;
        }
        throw new NFCOperationError(describeNfcError(error), classifyTransceiveError(error));
      }
    });
  }

  /**
   * Run something inside a technology session over the tag already in the field.
   *
   * `requestTechnology` reuses the reader-mode registration this service holds
   * rather than opening one of its own, so the scan loop keeps running and the
   * matching cancel does not tear it down. That is why an operation does not
   * have to stop and restart scanning.
   */
  private async withTechnology<T>(tech: NfcTech, operation: () => Promise<T>): Promise<T> {
    if (!this.isForegroundActive) {
      throw new NFCOperationError("The reader is not running", "TAG_NOT_CONNECTED");
    }

    try {
      await NfcManager.requestTechnology(tech);
    } catch (error) {
      // The tag is gone, or does not speak this technology at all.
      throw new NFCOperationError(describeNfcError(error), "TAG_NOT_CONNECTED");
    }

    try {
      return await operation();
    } finally {
      // Leaves the reader-mode registration alone, since requestTechnology
      // did not create it.
      await NfcManager.cancelTechnologyRequest().catch(() => undefined);
    }
  }

  /** The UID of the tag the reader is currently holding, if any. */
  currentTagUid(): string | null {
    return useAppStore.getState().nfc.lastTag?.uid ?? null;
  }

  /**
   * Carry out a write the agent asked for, and describe the outcome in its
   * terms. Refusals are outcomes too — the agent is waiting on this.
   */
  async handleWriteRequest(
    requestID: string,
    payload: DeviceWriteRequestPayload,
  ): Promise<DeviceWriteResponsePayload> {
    const refuse = (error: string, errorCode: DeviceErrorCode) => ({
      requestID,
      success: false,
      error,
      errorCode,
    });

    if (!this.canWrite()) {
      return refuse("This device cannot write tags", "NOT_SUPPORTED");
    }

    // A write names the tag it is for. Writing whatever happens to be present
    // would put the data on the wrong tag, which is worse than not writing.
    const held = this.currentTagUid();
    if (!held) {
      return refuse("No tag is present", "TAG_NOT_CONNECTED");
    }
    if (payload.tagUID && payload.tagUID !== held) {
      return refuse(`Tag ${payload.tagUID} is no longer the one present`, "TAG_REMOVED");
    }

    let bytes: number[];
    try {
      bytes = encodeWritePayload(payload);
    } catch (error) {
      return refuse(describeNfcError(error), "INVALID_DATA");
    }

    try {
      await this.writeNdef(bytes, { lock: payload.lock });
      return { requestID, success: true };
    } catch (error) {
      if (error instanceof NFCOperationError) {
        return refuse(error.message, error.code);
      }
      return refuse(describeNfcError(error), "WRITE_FAILED");
    }
  }

  /**
   * Exchange raw bytes with the tag on the agent's behalf.
   *
   * Unlike a write there is no idempotency key, and rightly so: an exchange is
   * a question to the tag, and the agent cannot know whether repeating one is
   * safe. Repeating is its decision to make.
   */
  async handleTransceiveRequest(
    requestID: string,
    payload: DeviceTransceiveRequestPayload,
  ): Promise<DeviceTransceiveResponsePayload> {
    const refuse = (error: string, errorCode: DeviceErrorCode) => ({
      requestID,
      success: false,
      error,
      errorCode,
    });

    if (!this.canTransceive()) {
      return refuse("This device cannot exchange raw commands", "NOT_SUPPORTED");
    }

    const held = this.currentTagUid();
    if (!held) {
      return refuse("No tag is present", "TAG_NOT_CONNECTED");
    }
    if (payload.tagUID && payload.tagUID !== held) {
      return refuse(`Tag ${payload.tagUID} is no longer the one present`, "TAG_REMOVED");
    }

    if (!payload.data) {
      return refuse("Transceive request carried no command", "INVALID_DATA");
    }

    let command: number[];
    try {
      command = base64ToBytes(payload.data);
    } catch (error) {
      return refuse(describeNfcError(error), "INVALID_DATA");
    }

    try {
      const response = await this.transceive(command, {
        raw: payload.raw,
        timeoutMs: payload.timeoutMs,
      });
      return { requestID, success: true, data: bytesToBase64(response) };
    } catch (error) {
      if (error instanceof NFCOperationError) {
        return refuse(error.message, error.code);
      }
      return refuse(describeNfcError(error), "TRANSCEIVE_FAILED");
    }
  }

  /** Android can send the user straight to the NFC toggle; iOS cannot. */
  canOpenSystemSettings(): boolean {
    return Platform.OS === "android";
  }

  async openSystemSettings(): Promise<void> {
    if (!this.canOpenSystemSettings()) {
      return;
    }

    try {
      await NfcManager.goToNfcSetting();
    } catch (error) {
      console.error("[NFC] Failed to open NFC settings:", error);
    }
  }
}

export const nfcService = NFCService.getInstance();
