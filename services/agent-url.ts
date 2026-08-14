import { WS_CONFIG } from "@/constants/config";

const SCHEME_RE = /^(wss?|https?):\/\//i;

// Query parameters that identify this connection to the agent. They are owned
// by this module: whatever comes in carrying them gets them rebuilt, so the
// result is the same whether the input is a bare host or a URL this function
// already produced.
const OWNED_PARAMS = ["mode", "secret"];

interface BuildOptions {
  secret?: string | null;
  // Whether the agent is serving TLS. Consulted only when the input carries no
  // scheme of its own.
  tls?: boolean;
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index === -1) {
    return [value, ""];
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}

/**
 * Build the device WebSocket URL the agent expects.
 *
 * Accepts anything from a bare `192.168.1.5:9470` to a full URL, and settles
 * the three things the agent cares about: the scheme, the `/ws` path, and the
 * `mode=device` discriminator that tells the shared port a device is calling
 * rather than a client.
 */
export function buildDeviceUrl(input: string, options: BuildOptions = {}): string {
  const { secret, tls } = options;

  let rest = input.trim();
  let scheme: "ws" | "wss";

  const schemeMatch = rest.match(SCHEME_RE);
  if (schemeMatch) {
    const found = schemeMatch[1].toLowerCase();
    scheme = found === "wss" || found === "https" ? "wss" : "ws";
    rest = rest.slice(schemeMatch[0].length);
  } else {
    // The agent generates and persists a certificate on first run, so TLS is
    // what an unqualified host is most likely serving.
    scheme = tls === false ? "ws" : "wss";
  }

  const [beforeQuery, existingQuery] = splitOnce(rest, "?");

  const slash = beforeQuery.indexOf("/");
  const authority = slash === -1 ? beforeQuery : beforeQuery.slice(0, slash);
  const suppliedPath = slash === -1 ? "" : beforeQuery.slice(slash);
  const path =
    suppliedPath === "" || suppliedPath === "/" ? WS_CONFIG.DEFAULT_PATH : suppliedPath;

  const params = existingQuery
    .split("&")
    .filter((part) => part !== "" && !OWNED_PARAMS.includes(splitOnce(part, "=")[0]));

  params.push("mode=device");
  if (secret) {
    params.push(`secret=${encodeURIComponent(secret)}`);
  }

  return `${scheme}://${authority}${path}?${params.join("&")}`;
}

/**
 * The bare host out of anything that addresses the agent — scheme, port, path
 * and query stripped. Pairing needs it because it runs on a different port from
 * the WebSocket endpoint.
 */
export function hostFromAgentUrl(input: string): string {
  const withoutScheme = input.trim().replace(SCHEME_RE, "");
  const [beforeQuery] = splitOnce(withoutScheme, "?");
  const slash = beforeQuery.indexOf("/");
  const authority = slash === -1 ? beforeQuery : beforeQuery.slice(0, slash);
  const [host] = splitOnce(authority, ":");

  return host;
}

/**
 * The agent's pairing page, where the PIN is shown. Served over plain HTTP on
 * its own port, because a device that does not yet hold the agent's key pin
 * cannot verify a TLS connection to it.
 */
export function buildBootstrapUrl(input: string): string {
  return `http://${hostFromAgentUrl(input)}:${WS_CONFIG.BOOTSTRAP_PORT}/`;
}
