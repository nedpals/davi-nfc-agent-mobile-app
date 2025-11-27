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

// Device registration
export interface DeviceCapabilities {
  canRead: boolean;
  canWrite: boolean;
  nfcType: string;
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

export interface ServerInfo {
  version: string;
  supportedNFC: string[];
}

export interface RegisterDeviceResponsePayload {
  deviceID: string;
  sessionToken: string;
  serverInfo: ServerInfo;
}

export interface RegisterDeviceResponse extends BaseMessage {
  type: "registerDeviceResponse";
  success: boolean;
  payload: RegisterDeviceResponsePayload;
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
  code: string;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  success: false;
  error: string;
  payload: ErrorPayload;
}

// Union types for type safety
export type OutgoingMessage =
  | RegisterDeviceMessage
  | TagScannedMessage
  | DeviceHeartbeatMessage;

export type IncomingMessage = RegisterDeviceResponse | ErrorMessage;

// Discovered server from mDNS
export interface DiscoveredServer {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  txtRecords: {
    version?: string;
    protocol?: string;
    path?: string;
    device_mode?: string;
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
