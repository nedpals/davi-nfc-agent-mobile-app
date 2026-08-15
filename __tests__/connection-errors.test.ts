import {
  describeConnectionFailure,
  isTerminalConnectionFailure,
} from "@/services/connection-errors";

describe("describeConnectionFailure", () => {
  it("explains the untrusted certificate an unpaired device actually hits", () => {
    // Verbatim from an Android device dialling an agent serving its own
    // certificate without having paired first.
    const raw =
      "java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.";

    const message = describeConnectionFailure(raw);

    expect(message).toMatch(/does not trust the agent's certificate/i);
    expect(message).toMatch(/pair/i);
    // The Java class name is what made the original unreadable.
    expect(message).not.toMatch(/CertPathValidatorException/);
  });

  it("tells a pin mismatch apart from an untrusted certificate", () => {
    // Thrown by this app's own trust manager, so a pin is held and did not match.
    const message = describeConnectionFailure(
      "java.security.cert.CertificateException: agent key pin mismatch"
    );

    expect(message).toMatch(/not the one recorded when pairing/i);
    // The remedy differs: re-pair, rather than pair for the first time.
    expect(message).toMatch(/unpair and pair again/i);
  });

  it("names the port when nothing answered", () => {
    const message = describeConnectionFailure(
      "java.net.ConnectException: Failed to connect to /192.168.1.5:9470"
    );

    expect(message).toMatch(/nothing answered/i);
    expect(message).toContain("9470");
  });

  it("explains a blocked cleartext connection", () => {
    const message = describeConnectionFailure(
      "java.io.IOException: Cleartext HTTP traffic to 192.168.1.5 not permitted"
    );

    expect(message).toMatch(/blocked a plain connection/i);
  });

  it("keeps an unrecognised failure verbatim", () => {
    // Flattening it would hide the only evidence of what went wrong.
    const raw = "something entirely new";
    expect(describeConnectionFailure(raw)).toBe(raw);
  });

  it("has something to say when the platform said nothing", () => {
    expect(describeConnectionFailure("")).toMatch(/did not answer/i);
    expect(describeConnectionFailure(undefined)).toMatch(/did not answer/i);
  });
});

describe("isTerminalConnectionFailure", () => {
  it("treats an untrusted certificate as final", () => {
    // The agent logged this same event as "remote error: tls: unknown
    // certificate" once per attempt, which is the retry loop achieving nothing.
    expect(
      isTerminalConnectionFailure(
        "java.security.cert.CertPathValidatorException: Trust anchor for certification path not found."
      )
    ).toBe(true);
  });

  it("treats a pin mismatch as final", () => {
    expect(isTerminalConnectionFailure("agent key pin mismatch")).toBe(true);
  });

  it("leaves an agent that is merely absent retryable", () => {
    // It may be starting, or the network may come back.
    expect(
      isTerminalConnectionFailure("java.net.ConnectException: Failed to connect to /192.168.1.5:9470")
    ).toBe(false);
    expect(isTerminalConnectionFailure("")).toBe(false);
  });
});
