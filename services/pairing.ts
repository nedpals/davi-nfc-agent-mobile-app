import { Platform } from "react-native";
import { WS_CONFIG } from "@/constants/config";
import type { AgentCredential, PairRequest, PairResponse } from "@/types/protocol";

// Pairing runs over plain HTTP on the bootstrap port, because a device that has
// not yet learned the agent's key pin has no way to verify a TLS connection to
// it. The PIN is what protects the exchange.
function buildPairUrl(host: string, pin: string): string {
  return `http://${host}:${WS_CONFIG.BOOTSTRAP_PORT}/pair?pin=${encodeURIComponent(pin)}`;
}

export class PairingError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PairingError";
    this.status = status;
  }
}

function describeFailure(status: number, body: string): string {
  // The agent locks pairing after five wrong PINs, which reads as an ordinary
  // rejection unless it is called out.
  if (status === 401 || status === 403) {
    return "That PIN was not accepted. Five wrong attempts lock pairing until the agent restarts.";
  }
  if (status === 429) {
    return "Pairing is locked after too many wrong PINs. Restart the agent to try again.";
  }
  if (status === 404) {
    return "This agent does not offer pairing. It may predate the pairing flow.";
  }
  return body.trim() || `Pairing failed (HTTP ${status}).`;
}

/**
 * Exchange the PIN shown on the kiosk for this device's own credential.
 *
 * The token comes back exactly once — the agent stores only its hash — so the
 * caller is responsible for persisting the result before it is lost.
 */
export async function pairWithAgent(
  host: string,
  pin: string,
  deviceName: string,
): Promise<AgentCredential> {
  const platform: PairRequest["platform"] = Platform.OS === "ios" ? "ios" : "android";
  const body: PairRequest = { deviceName, platform };

  let response: Response;
  try {
    response = await fetch(buildPairUrl(host, pin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new PairingError(
      `Could not reach the agent at ${host}:${WS_CONFIG.BOOTSTRAP_PORT}. ${
        error instanceof Error ? error.message : String(error)
      }`,
      0,
    );
  }

  if (!response.ok) {
    throw new PairingError(describeFailure(response.status, await response.text()), response.status);
  }

  const payload = (await response.json()) as Partial<PairResponse>;
  if (!payload.deviceToken || !payload.deviceID) {
    throw new PairingError("The agent's pairing response was missing a token.", response.status);
  }

  return {
    host,
    agentPort: payload.agentPort || WS_CONFIG.DEFAULT_PORT,
    deviceID: payload.deviceID,
    deviceToken: payload.deviceToken,
    // Empty when the agent serves no TLS, which is a valid answer rather than a
    // missing one: it tells the device to connect over ws://.
    publicKeyPin: payload.publicKeyPin || "",
  };
}
