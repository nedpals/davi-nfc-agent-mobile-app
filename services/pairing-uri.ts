import { WS_CONFIG } from "@/constants/config";

/**
 * The pairing invitation the agent prints as a QR at startup.
 *
 * It carries the one value a device cannot obtain safely over the network: the
 * agent's public key pin. Everything else in it — the address, the PIN — is
 * convenience, and the pin is what makes the pairing connection verifiable
 * before a credential crosses it.
 *
 *     davi-pair://192.168.1.5:9470/?spki=sha256%2F47DE…&code=123456&name=Kiosk
 */
export interface PairingInvitation {
  host: string;
  port: number;
  /** "sha256/<base64>" over the agent's SubjectPublicKeyInfo. */
  spki: string;
  /** The pairing PIN. Absent when the QR was printed without one. */
  code?: string;
  /** What the agent calls itself, for the screen to show. */
  name?: string;
}

export const PAIRING_URI_SCHEME = "davi-pair";

export class PairingUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingUriError";
  }
}

function splitAuthority(authority: string): { host: string; port: string } {
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    if (end !== -1) {
      const rest = authority.slice(end + 1);
      return { host: authority.slice(1, end), port: rest.startsWith(":") ? rest.slice(1) : "" };
    }
  }
  // A bare IPv6 literal written without the brackets a URL wants: its colons
  // are the address, not a port.
  if (authority.split(":").length - 1 > 1) {
    return { host: authority, port: "" };
  }
  const colon = authority.indexOf(":");
  if (colon === -1) {
    return { host: authority, port: "" };
  }
  return { host: authority.slice(0, colon), port: authority.slice(colon + 1) };
}

function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? "" : part.slice(eq + 1);
    // "+" is a space in a query string, which decodeURIComponent does not know.
    params.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, " ")));
  }
  return params;
}

/** Whether a string looks like one of these at all, for a paste box to check. */
export function isPairingUri(input: string): boolean {
  return input.trim().toLowerCase().startsWith(`${PAIRING_URI_SCHEME}:`);
}

/**
 * Read an invitation, or say what is wrong with it.
 *
 * Strict about `spki`: an invitation without one buys nothing over typing the
 * PIN, and accepting it as if it did would report a pairing as verified that
 * nothing verified.
 */
export function parsePairingUri(input: string): PairingInvitation {
  const raw = input.trim();
  if (!isPairingUri(raw)) {
    throw new PairingUriError(
      `That is not a pairing link. The agent's QR encodes one starting ${PAIRING_URI_SCHEME}://.`
    );
  }

  let rest = raw.slice(`${PAIRING_URI_SCHEME}:`.length);
  if (rest.startsWith("//")) {
    rest = rest.slice(2);
  }

  const queryAt = rest.indexOf("?");
  const query = queryAt === -1 ? "" : rest.slice(queryAt + 1);
  const beforeQuery = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const slash = beforeQuery.indexOf("/");
  const authority = slash === -1 ? beforeQuery : beforeQuery.slice(0, slash);

  const { host, port } = splitAuthority(authority);
  if (!host) {
    throw new PairingUriError("That pairing link names no agent address.");
  }

  const params = parseQuery(query);
  const spki = params.get("spki")?.trim() ?? "";
  if (!spki) {
    throw new PairingUriError(
      "That pairing link carries no key pin, so the agent could not be verified. " +
        "Read the QR the agent prints at startup."
    );
  }
  if (!spki.startsWith("sha256/")) {
    throw new PairingUriError("That pairing link's key pin is not in a form this app recognizes.");
  }

  const parsedPort = Number.parseInt(port, 10);
  const code = params.get("code")?.trim();

  return {
    host,
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : WS_CONFIG.DEFAULT_PORT,
    spki,
    ...(code ? { code } : {}),
    ...(params.get("name")?.trim() ? { name: params.get("name")?.trim() } : {}),
  };
}
