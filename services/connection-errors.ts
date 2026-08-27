/**
 * Turn what the platform says about a failed connection into something a person
 * can act on.
 *
 * The socket layer surfaces the platform's own text, which on Android is a Java
 * exception — `java.security.cert.CertPathValidatorException: Trust anchor for
 * certification path not found.` is what an unpaired device sees against an
 * agent serving its own certificate, and it says nothing about what to do.
 */

interface Translation {
  /** Matched case-insensitively against the platform's text. */
  match: string[];
  message: string;
}

const TRANSLATIONS: Translation[] = [
  {
    // The trust manager this app installs threw, so a pin is held and the key
    // on the wire is not it.
    match: ["agent key pin mismatch"],
    message:
      "This agent's key is not the one recorded when pairing. If the agent was " +
      "reinstalled its key changed, so unpair and pair again. Otherwise something " +
      "is answering in its place.",
  },
  {
    match: ["trust anchor for certification path", "certpathvalidatorexception"],
    message:
      "This device does not trust the agent's certificate. Pair with the agent — " +
      "pairing hands over the key to recognize it by, which is what replaces a " +
      "certificate authority.",
  },
  {
    match: ["cleartext communication", "cleartext http traffic"],
    message:
      "This device blocked a plain connection to the agent. Connect over wss://, " +
      "or allow the agent's address in the app's network configuration.",
  },
  {
    match: ["sslpeerunverified", "hostname verification", "not verified"],
    message:
      "The agent's certificate does not name the address it was reached at. " +
      "Reaching it by the address it advertises usually resolves this.",
  },
  {
    match: ["econnrefused", "failed to connect to", "connection refused"],
    message:
      "Nothing answered at that address. Check the agent is running and that the " +
      "port is right — it serves devices on 9470 by default.",
  },
  {
    match: ["etimedout", "connect timed out", "software caused connection abort"],
    message:
      "The agent did not answer in time. It may be on a different network from " +
      "this device.",
  },
  {
    // The agent checks its API secret before the upgrade, so a bad one is an
    // HTTP status rather than a close frame.
    match: ["401", "unauthorized"],
    message:
      "The agent refused this device's credential. Pair again, or check the API " +
      "secret in Settings if you are using one.",
  },
];

/**
 * Returns a readable explanation, or the original text when nothing matches —
 * an unrecognised failure is better shown verbatim than flattened into a
 * generic message that hides what happened.
 */
export function describeConnectionFailure(raw: string | undefined | null): string {
  const text = (raw ?? "").trim();
  if (!text) {
    return "The agent did not answer.";
  }

  const haystack = text.toLowerCase();
  for (const { match, message } of TRANSLATIONS) {
    if (match.some((needle) => haystack.includes(needle))) {
      return message;
    }
  }

  return text;
}

// Failures that cannot come out differently on a retry. A certificate this
// device does not trust is not trusted a second later either, and neither is a
// key that does not match the pin — both need someone to pair, so spending the
// reconnect budget on them only delays saying so.
const TERMINAL = [
  "agent key pin mismatch",
  "trust anchor for certification path",
  "certpathvalidatorexception",
  "cleartext communication",
  "cleartext http traffic",
];

export function isTerminalConnectionFailure(raw: string | undefined | null): boolean {
  const haystack = (raw ?? "").toLowerCase();
  return TERMINAL.some((needle) => haystack.includes(needle));
}

// Failures pairing is the answer to: the agent's certificate is not trusted, or
// its credential was refused. Both are what an unpaired device gets from an
// agent serving its own certificate, which is every agent by default.
const NEEDS_PAIRING = [
  "trust anchor for certification path",
  "certpathvalidatorexception",
  "agent key pin mismatch",
  "401",
  "unauthorized",
];

export function needsPairing(raw: string | undefined | null): boolean {
  const haystack = (raw ?? "").toLowerCase();
  return NEEDS_PAIRING.some((needle) => haystack.includes(needle));
}

/**
 * WebSocket close codes the agent uses to say why a session ended.
 *
 * A close frame carries a code and, optionally, a reason. The agent phrases
 * some of these and leaves others to the code alone, so the code is read first
 * and the reason used to fill in what it cannot say.
 */
export const CLOSE_CODE = {
  normal: 1000,
  goingAway: 1001,
  // Agent 1.2.0 ends the session of a device whose credential was revoked from
  // the tray, and of one that sent a frame over the 256 KB cap.
  policyViolation: 1008,
  messageTooBig: 1009,
} as const;

/**
 * What a close means, in terms someone holding the phone can act on.
 *
 * Falls through to the reason text where the code says nothing particular, so
 * an ordinary drop still reads the way it did before there were codes.
 */
export function describeCloseCode(code: number | undefined, reason?: string | null): string {
  if (code === CLOSE_CODE.policyViolation) {
    return (
      "The agent ended this session. Its credential was most likely revoked from the agent's " +
      "tray, in which case pairing again is what restores it."
    );
  }
  if (code === CLOSE_CODE.messageTooBig) {
    return "The agent refused a frame this device sent for being too large, and closed the session.";
  }
  return describeConnectionFailure(reason);
}

/**
 * Whether a close is worth reconnecting after.
 *
 * A revoked credential is refused just as fast on the next attempt, and
 * spending the reconnect budget on it only delays saying so — the same reason
 * an untrusted certificate is not retried.
 */
export function isTerminalCloseCode(code: number | undefined): boolean {
  return code === CLOSE_CODE.policyViolation;
}
