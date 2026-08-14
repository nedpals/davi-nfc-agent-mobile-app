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

// Union types for type safety
export type OutgoingMessage =
  | HelloMessage
  | RegisterDeviceMessage
  | TagScannedMessage
  | TagRemovedMessage
  | DeviceHeartbeatMessage
  | GoodbyeMessage;

export type IncomingMessage =
  | HelloResponse
  | RegisterDeviceResponse
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
