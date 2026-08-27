import { Platform } from "react-native";
import { WS_CONFIG } from "@/constants/config";
import { formatHost } from "@/services/agent-url";
import { postPinned } from "@/services/pinning";
import type { AgentCredential, PairRequest, PairResponse } from "@/types/protocol";

/**
 * Pairing runs over TLS on the agent's own port, pinned to the key its QR
 * carries.
 *
 * It used to be a plain HTTP POST to the bootstrap listener, and agent 1.2.0
 * stopped serving it there: the response carries a durable token and the key
 * pin, so issuing it in the clear handed both to anyone watching the network
 * and let an active attacker substitute a pin of their own. The bootstrap
 * listener keeps its port for handing out the certificate authority; it no
 * longer routes /pair, and /pair refuses cleartext from anything but loopback
 * wherever it is mounted.
 */
function buildPairUrl(host: string, port: number, pin: string): string {
  return `https://${formatHost(host)}:${port}/pair?pin=${encodeURIComponent(pin)}`;
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
  if (status === 426) {
    return "The agent refused to pair over a plain connection. It serves pairing over TLS on its own port.";
  }
  if (status === 404) {
    return (
      "This agent does not serve pairing on its own port. Agents before 1.2.0 served it on the " +
      "bootstrap port instead, and this app no longer pairs over a plain connection."
    );
  }
  return body.trim() || `Pairing failed (HTTP ${status}).`;
}

export interface PairOptions {
  /**
   * The `spki` the agent's QR carried, which the pairing connection is pinned
   * to. `null` pairs trust-on-first-use: the PIN still authorizes the exchange,
   * but nothing proves the agent answering is the one that printed it, so the
   * credential is recorded as unverified.
   */
  keyPin: string | null;
  /** Where the agent serves. Defaults to the port it serves devices on. */
  port?: number;
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
  { keyPin, port = WS_CONFIG.DEFAULT_PORT }: PairOptions
): Promise<AgentCredential> {
  const platform: PairRequest["platform"] = Platform.OS === "ios" ? "ios" : "android";
  const body: PairRequest = { deviceName, platform };

  let response: { status: number; body: string };
  try {
    response = await postPinned(buildPairUrl(host, port, pin), keyPin, body);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // The pin check fails the handshake, which surfaces here as an ordinary
    // request failure. Saying so is the difference between "the network is
    // down" and "that is not the agent whose QR you read".
    if (keyPin && /pin mismatch|cancelled|canceled|-999/i.test(detail)) {
      throw new PairingError(
        "The agent answering does not hold the key its pairing code names. Read the QR again " +
          "from the agent's own screen, and if it still fails, something is answering in its place.",
        0
      );
    }
    throw new PairingError(
      `Could not reach the agent at ${formatHost(host)}:${port}. ${detail}`,
      0
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw new PairingError(describeFailure(response.status, response.body), response.status);
  }

  let payload: Partial<PairResponse>;
  try {
    payload = JSON.parse(response.body) as Partial<PairResponse>;
  } catch {
    throw new PairingError("The agent's pairing answer was not readable.", response.status);
  }

  if (!payload.deviceToken || !payload.deviceID) {
    throw new PairingError("The agent's pairing response was missing a token.", response.status);
  }

  const publicKeyPin = payload.publicKeyPin || "";

  // The response repeats the pin the QR carried, and the agent's docs are
  // explicit that they must match. They cannot disagree on a connection that
  // was pinned to one of them — that is what the pin refuses — but a mismatch
  // here would mean the two values came from different places, so it is checked
  // rather than assumed.
  if (keyPin && publicKeyPin && publicKeyPin !== keyPin) {
    throw new PairingError(
      "The agent reported a different key from the one its pairing code names.",
      response.status
    );
  }

  return {
    host,
    agentPort: payload.agentPort || port,
    deviceID: payload.deviceID,
    deviceToken: payload.deviceToken,
    // Empty when the agent serves no TLS, which is a valid answer rather than a
    // missing one: it tells the device to connect over ws://.
    publicKeyPin,
    keySource: !publicKeyPin ? "none" : keyPin !== null ? "qr" : "response",
  };
}
