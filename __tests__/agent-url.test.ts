import {
  buildBootstrapUrl,
  buildDeviceUrl,
  parseAgentAddress,
  formatHost,
  hostFromAgentUrl,
} from "@/services/agent-url";

describe("buildDeviceUrl", () => {
  it("assumes TLS and the default port for a bare host", () => {
    expect(buildDeviceUrl("192.168.1.5")).toBe("wss://192.168.1.5:9470/ws?mode=device");
  });

  it("keeps a port the caller supplied", () => {
    expect(buildDeviceUrl("192.168.1.5:8080")).toBe("wss://192.168.1.5:8080/ws?mode=device");
  });

  it("falls back to the port option when the address names none", () => {
    expect(buildDeviceUrl("192.168.1.5", { port: 9999 })).toBe(
      "wss://192.168.1.5:9999/ws?mode=device"
    );
  });

  it("downgrades to ws:// when told the agent serves no TLS", () => {
    expect(buildDeviceUrl("192.168.1.5:9470", { tls: false })).toBe(
      "ws://192.168.1.5:9470/ws?mode=device"
    );
  });

  it("honours an explicit scheme over the tls hint", () => {
    expect(buildDeviceUrl("ws://192.168.1.5:9470", { tls: true })).toBe(
      "ws://192.168.1.5:9470/ws?mode=device"
    );
    expect(buildDeviceUrl("https://agent.local:9470", { tls: false })).toBe(
      "wss://agent.local:9470/ws?mode=device"
    );
  });

  it("appends the secret, encoded", () => {
    expect(buildDeviceUrl("192.168.1.5:9470", { secret: "a b&c" })).toBe(
      "wss://192.168.1.5:9470/ws?mode=device&secret=a%20b%26c"
    );
  });

  it("is idempotent over its own output", () => {
    const once = buildDeviceUrl("192.168.1.5:9470", { secret: "token" });
    expect(buildDeviceUrl(once, { secret: "token" })).toBe(once);
  });

  it("replaces a stale secret rather than adding a second one", () => {
    const stale = "wss://192.168.1.5:9470/ws?mode=device&secret=old";
    expect(buildDeviceUrl(stale, { secret: "new" })).toBe(
      "wss://192.168.1.5:9470/ws?mode=device&secret=new"
    );
  });

  it("keeps query parameters it does not own", () => {
    expect(buildDeviceUrl("192.168.1.5:9470/ws?trace=1", { secret: "s" })).toBe(
      "wss://192.168.1.5:9470/ws?trace=1&mode=device&secret=s"
    );
  });

  it("keeps a supplied path and defaults an empty one", () => {
    expect(buildDeviceUrl("192.168.1.5:9470/device")).toBe(
      "wss://192.168.1.5:9470/device?mode=device"
    );
    expect(buildDeviceUrl("192.168.1.5:9470/")).toBe("wss://192.168.1.5:9470/ws?mode=device");
  });

  it("brackets an IPv6 literal and does not mistake its colons for a port", () => {
    expect(buildDeviceUrl("fe80::1")).toBe("wss://[fe80::1]:9470/ws?mode=device");
    expect(buildDeviceUrl("[fe80::1]:9470")).toBe("wss://[fe80::1]:9470/ws?mode=device");
  });

  it("tolerates surrounding whitespace", () => {
    expect(buildDeviceUrl("  192.168.1.5:9470  ")).toBe("wss://192.168.1.5:9470/ws?mode=device");
  });
});

describe("hostFromAgentUrl", () => {
  it.each([
    ["192.168.1.5", "192.168.1.5"],
    ["192.168.1.5:9470", "192.168.1.5"],
    ["wss://192.168.1.5:9470/ws?mode=device", "192.168.1.5"],
    ["http://agent.local/pair", "agent.local"],
    ["[fe80::1]:9470", "fe80::1"],
    ["fe80::1", "fe80::1"],
  ])("reduces %s to %s", (input, expected) => {
    expect(hostFromAgentUrl(input)).toBe(expected);
  });

  it("returns an empty string for empty input", () => {
    expect(hostFromAgentUrl("")).toBe("");
  });
});

describe("formatHost", () => {
  it("brackets IPv6 only once", () => {
    expect(formatHost("fe80::1")).toBe("[fe80::1]");
    expect(formatHost("[fe80::1]")).toBe("[fe80::1]");
    expect(formatHost("192.168.1.5")).toBe("192.168.1.5");
  });
});

describe("buildBootstrapUrl", () => {
  it("always uses plain HTTP on the bootstrap port", () => {
    expect(buildBootstrapUrl("wss://192.168.1.5:9470/ws")).toBe("http://192.168.1.5:9472/");
  });
});

describe("parseAgentAddress", () => {
  it("splits a host from the port it names", () => {
    expect(parseAgentAddress("192.168.1.5:9470")).toEqual({ host: "192.168.1.5", port: 9470 });
  });

  it("leaves the port out when the address named none", () => {
    expect(parseAgentAddress("kiosk.local")).toEqual({ host: "kiosk.local" });
  });

  // The colons are the address, not a port, which is the whole reason a typed
  // address cannot be split on one.
  it("keeps a bare IPv6 literal whole", () => {
    expect(parseAgentAddress("fe80::1")).toEqual({ host: "fe80::1" });
  });

  it("reads a port off a bracketed IPv6 literal", () => {
    expect(parseAgentAddress("[fe80::1]:9470")).toEqual({ host: "fe80::1", port: 9470 });
  });

  it("strips a scheme, path and query", () => {
    expect(parseAgentAddress("wss://192.168.1.5:9470/ws?mode=device")).toEqual({
      host: "192.168.1.5",
      port: 9470,
    });
  });

  it("ignores a port that is not a number", () => {
    expect(parseAgentAddress("kiosk.local:nine")).toEqual({ host: "kiosk.local" });
  });
});
