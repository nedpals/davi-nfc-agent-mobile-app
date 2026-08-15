import type { ConnectionStatus } from "@/types/protocol";

const LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  registered: "Registered",
  reconnecting: "Reconnecting…",
  error: "Not connected",
};

/**
 * The connection state in words. The status itself is a wire value — showing
 * `registered` to someone reads as a machine talking to itself.
 */
export function connectionLabel(status: ConnectionStatus): string {
  return LABELS[status] ?? LABELS.disconnected;
}
