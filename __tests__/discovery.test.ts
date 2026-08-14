import { discoveryService, preferredAddress } from "@/services/discovery";
import type { DiscoveredServer } from "@/types/protocol";

const server = (overrides: Partial<DiscoveredServer> = {}): DiscoveredServer => ({
  name: "davi-agent",
  host: "kiosk.local.",
  port: 9470,
  addresses: ["192.168.1.5"],
  txtRecords: {},
  ...overrides,
});

describe("preferredAddress", () => {
  it("prefers IPv4 over anything else resolved", () => {
    expect(preferredAddress(server({ addresses: ["fe80::1", "192.168.1.5"] }))).toBe("192.168.1.5");
  });

  it("uses whatever was resolved when there is no IPv4", () => {
    expect(preferredAddress(server({ addresses: ["fe80::1"] }))).toBe("fe80::1");
  });

  it("falls back to the advertised hostname", () => {
    expect(preferredAddress(server({ addresses: [] }))).toBe("kiosk.local.");
  });
});

describe("buildWebSocketUrl", () => {
  it("uses the advertised device path and port", () => {
    const url = discoveryService.buildWebSocketUrl(
      server({ txtRecords: { device_path: "/ws?mode=device", tls: "true" } })
    );

    expect(url).toBe("wss://192.168.1.5:9470/ws?mode=device");
  });

  it("downgrades to ws:// when the agent advertises no TLS", () => {
    const url = discoveryService.buildWebSocketUrl(server({ txtRecords: { tls: "false" } }));

    expect(url).toBe("ws://192.168.1.5:9470/ws?mode=device");
  });

  it("assumes TLS on an agent too old to advertise it", () => {
    expect(discoveryService.buildWebSocketUrl(server())).toBe(
      "wss://192.168.1.5:9470/ws?mode=device"
    );
  });

  it("brackets an IPv6 address so the port is not read as part of it", () => {
    const url = discoveryService.buildWebSocketUrl(server({ addresses: ["fe80::1"] }));

    expect(url).toBe("wss://[fe80::1]:9470/ws?mode=device");
  });

  it("falls back to the default port when none was advertised", () => {
    expect(discoveryService.buildWebSocketUrl(server({ port: 0 }))).toBe(
      "wss://192.168.1.5:9470/ws?mode=device"
    );
  });
});
