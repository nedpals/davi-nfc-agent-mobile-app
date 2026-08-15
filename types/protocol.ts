// WebSocket Protocol Types for davi-nfc-agent communication

// Base message structure
export interface BaseMessage {
  id?: string;
  type: string;
  payload?: unknown;
}

// Connection status enum
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "registered"
  | "reconnecting"
  | "error";

// The subprotocol offered during the upgrade. An agent that echoes it back
// speaks the hello handshake; one that echoes nothing predates versioning and
// is served with registerDevice instead.
export const DEVICE_SUBPROTOCOL_V1 = "davi-nfc-device.v1";

export type ProtocolVersion = 0 | 1;

// Device registration
export interface DeviceCapabilities {
  // The v0 declaration, always sent.
  canRead: boolean;
  canWrite: boolean;
  nfcType: string;

  // v1 additions. Omitted where they do not apply, so a device declaring
  // nothing extra sends exactly the v0 object.
  canTransceive?: boolean;
  canTransceiveRaw?: boolean;
  canLock?: boolean;
  deviceType?: string;
  supportedTagTypes?: string[];
  maxBaudRate?: number;

  // How long this device can keep a tag available for work after reporting it.
  // Omitted means open-ended, which is what a reader holding a tag in its field
  // offers and how every device behaved before the field existed.
  maxHoldMs?: number;
}

export interface DeviceMetadata {
  osVersion: string;
  model: string;
}

export interface RegisterDevicePayload {
  deviceName: string;
  platform: "ios" | "android";
  appVersion: string;
  capabilities: DeviceCapabilities;
  metadata?: DeviceMetadata;
}

export interface RegisterDeviceMessage extends BaseMessage {
  type: "registerDevice";
  payload: RegisterDevicePayload;
}

// hello folds the version declaration into registration, so setup costs one
// round trip rather than two.
export interface HelloPayload extends RegisterDevicePayload {
  protocolVersion: ProtocolVersion;
}

export interface HelloMessage extends BaseMessage {
  type: "hello";
  payload: HelloPayload;
}

export interface ServerInfo {
  version: string;
  supportedNFC: string[];
}

export interface RegisterDeviceResponsePayload {
  deviceID: string;
  // Reserved by the agent and always empty. A device's credential comes from
  // pairing, not from this field.
  sessionToken?: string;
  serverInfo: ServerInfo;
}

export interface RegisterDeviceResponse extends BaseMessage {
  type: "registerDeviceResponse";
  success: boolean;
  payload: RegisterDeviceResponsePayload;
}

export interface HelloResponsePayload extends RegisterDeviceResponsePayload {
  // What both sides will speak. Never higher than what was asked for, so it is
  // read rather than assumed.
  protocolVersion: ProtocolVersion;
}

export interface HelloResponse extends BaseMessage {
  type: "helloResponse";
  success: boolean;
  payload: HelloResponsePayload;
}

// Sent before an intentional disconnect so the agent logs a departure rather
// than waiting out a device it thinks it lost.
export interface GoodbyeMessage extends BaseMessage {
  type: "goodbye";
  payload: {
    deviceID: string;
    reason?: string;
  };
}

// NDEF Message types
export interface NDEFRecord {
  tnf: number;
  type: string; // base64 encoded
  payload: string; // base64 encoded
  recordType?: string;
  content?: string;
  language?: string;
}

export interface NDEFMessage {
  records: NDEFRecord[];
}

// Tag scanning
export interface TagScannedPayload {
  deviceID: string;
  uid: string;
  technology: string;
  type: string;
  scannedAt: string;
  ndefMessage?: NDEFMessage;
  rawData?: string;
}

export interface TagScannedMessage extends BaseMessage {
  type: "tagScanned";
  payload: TagScannedPayload;
}

// Tag removed
export interface TagRemovedPayload {
  deviceID: string;
  uid: string;
  removedAt: string;
}

export interface TagRemovedMessage extends BaseMessage {
  type: "tagRemoved";
  payload: TagRemovedPayload;
}

// Heartbeat
export interface DeviceHeartbeatPayload {
  deviceID: string;
  timestamp: string;
}

export interface DeviceHeartbeatMessage extends BaseMessage {
  type: "deviceHeartbeat";
  payload: DeviceHeartbeatPayload;
}

// Error response
export interface ErrorPayload {
  // Always present, and its strings are stable.
  code: string;

  // v1 additions. retryable answers whether repeating the identical request
  // could plausibly succeed; a client reading only code is unaffected.
  retryable?: boolean;
  op?: string;
  tagUID?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  success: false;
  error: string;
  payload: ErrorPayload;
}

// A tag that left the field is retryable, but retrying it means asking the
// person to present the tag again rather than resending on a timer.
export const ERROR_CODE_TAG_REMOVED = "TAG_REMOVED";

// The outcomes an operation can report, from the agent's error taxonomy.
export const DEVICE_ERROR_CODES = {
  notSupported: "NOT_SUPPORTED",
  tagRemoved: "TAG_REMOVED",
  tagNotConnected: "TAG_NOT_CONNECTED",
  invalidData: "INVALID_DATA",
  timeout: "TIMEOUT",

  writeFailed: "WRITE_FAILED",
  readOnly: "READ_ONLY",
  capacityExceeded: "CAPACITY_EXCEEDED",

  transceiveFailed: "TRANSCEIVE_FAILED",
} as const;

export type DeviceErrorCode = (typeof DEVICE_ERROR_CODES)[keyof typeof DEVICE_ERROR_CODES];

// The record form the agent sends when it cannot send encoded bytes. Kept for
// completeness: this device writes ndefBytes, which the agent calls
// authoritative where the two disagree.
export interface NDEFRecordInput {
  recordType?: "text" | "uri" | "mime" | "external";
  content?: string;
  language?: string;
  mimeType?: string;
  tnf?: number;
  // Go encodes []byte as base64, so these arrive as strings rather than arrays.
  type?: string;
  id?: string;
  payload?: string;
}

export interface NDEFMessageInput {
  records: NDEFRecordInput[];
}

export interface DeviceWriteRequestPayload {
  requestID: string;
  deviceID: string;
  ndefMessage?: NDEFMessageInput;
  // The same message already encoded, base64 on the wire. Authoritative where
  // it and ndefMessage disagree.
  ndefBytes?: string;
  // When set, the write is meant for this tag; anything else present is a
  // different tag and the write must be refused rather than misapplied.
  tagUID?: string;
  lock?: boolean;
  // Identifies the logical write. The same request can arrive twice when a
  // response is lost, and a tag written twice is not the same as written once.
  idempotencyKey?: string;
}

export interface DeviceWriteRequestMessage extends BaseMessage {
  type: "deviceWriteRequest";
  payload: DeviceWriteRequestPayload;
}

export interface DeviceWriteResponsePayload {
  requestID: string;
  success: boolean;
  error?: string;
  // Preferred over parsing the error string.
  errorCode?: DeviceErrorCode;
}

export interface DeviceWriteResponseMessage extends BaseMessage {
  type: "deviceWriteResponse";
  payload: DeviceWriteResponsePayload;
}

export interface DeviceTransceiveRequestPayload {
  requestID: string;
  deviceID: string;
  // Command bytes, base64 on the wire.
  data: string;
  tagUID?: string;
  // Framing-level exchange (Android NfcA.transceive) rather than APDU-level
  // (IsoDep.transceive). Different technology, so a different session.
  raw?: boolean;
  // Bounds this one exchange. The agent allows itself a second more than it
  // asks for, so a device that honours its own deadline reports a real error
  // instead of racing the agent's.
  timeoutMs?: number;
}

export interface DeviceTransceiveRequestMessage extends BaseMessage {
  type: "deviceTransceiveRequest";
  payload: DeviceTransceiveRequestPayload;
}

export interface DeviceTransceiveResponsePayload {
  requestID: string;
  success: boolean;
  // The tag's reply, base64 on the wire.
  data?: string;
  error?: string;
  errorCode?: DeviceErrorCode;
}

export interface DeviceTransceiveResponseMessage extends BaseMessage {
  type: "deviceTransceiveResponse";
  payload: DeviceTransceiveResponsePayload;
}

// Pairing exchanges the kiosk's PIN for a credential belonging to this device.
export interface PairRequest {
  deviceName: string;
  platform: "ios" | "android";
}

export interface PairResponse {
  deviceID: string;
  // Shown once — the agent keeps only a hash, so losing it means pairing again.
  deviceToken: string;
  // "sha256/<base64>" over the agent's SubjectPublicKeyInfo. Empty when the
  // agent serves no TLS.
  publicKeyPin: string;
  agentPort: number;
}

// What pairing leaves behind, held for every later connection.
export interface AgentCredential {
  host: string;
  agentPort: number;
  deviceID: string;
  deviceToken: string;
  publicKeyPin: string;
}

// The part of a credential the UI may hold. The token is deliberately absent:
// it is a bearer secret and the keychain is the only copy that should exist.
export type PairingSummary = Omit<AgentCredential, "deviceToken">;

export function toPairingSummary(credential: AgentCredential): PairingSummary {
  return {
    host: credential.host,
    agentPort: credential.agentPort,
    deviceID: credential.deviceID,
    publicKeyPin: credential.publicKeyPin,
  };
}

// Union types for type safety
export type OutgoingMessage =
  | HelloMessage
  | RegisterDeviceMessage
  | TagScannedMessage
  | TagRemovedMessage
  | DeviceHeartbeatMessage
  | DeviceWriteResponseMessage
  | DeviceTransceiveResponseMessage
  | GoodbyeMessage;

export type IncomingMessage =
  | HelloResponse
  | RegisterDeviceResponse
  | DeviceWriteRequestMessage
  | DeviceTransceiveRequestMessage
  | ErrorMessage;

// Discovered server from mDNS
export interface DiscoveredServer {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  txtRecords: {
    version?: string;
    // The wire protocol ("websocket"), not the URL scheme — see tls for that.
    protocol?: string;
    path?: string;
    // "true" | "false". Absent on agents before 1.0.4.
    tls?: string;
    // The device endpoint with its discriminator, e.g. "/ws?mode=device".
    // Absent on agents before 1.0.4.
    device_path?: string;
    type?: string;
  };
}

// Scanned tag for local state
export interface ScannedTag {
  uid: string;
  technology: string;
  type: string;
  scannedAt: Date;
  ndefMessage?: NDEFMessage;
  sentToServer: boolean;
}
