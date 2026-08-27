import * as SecureStore from "expo-secure-store";
import { loadCredential } from "@/services/credentials";
import { describePinning } from "@/services/pinning";
import type { AgentCredential } from "@/types/protocol";

const mockSetPin = jest.fn();
// jest.mock is hoisted above the file, so anything its factory closes over has
// to be named mock* to be allowed through.
const mockNative = { isSupported: true, setPin: mockSetPin };

jest.mock("@/modules/agent-pinning", () => ({ __esModule: true, default: mockNative }));

function credential(overrides: Partial<AgentCredential> = {}): AgentCredential {
  return {
    host: "192.168.1.5",
    agentPort: 9470,
    deviceID: "device-1",
    deviceToken: "token",
    publicKeyPin: "sha256/aaa",
    keySource: "response",
    ...overrides,
  };
}

describe("describePinning", () => {
  beforeEach(() => {
    mockSetPin.mockClear();
    mockNative.isSupported = true;
  });

  it("reports a pairing made from the agent's QR as enforced", () => {
    expect(describePinning(credential({ keySource: "qr" }))).toEqual({
      status: "pinned",
      pin: "sha256/aaa",
    });
  });

  // The distinction this exists for: a key nothing checked is not the same
  // answer as no key to check, and both used to read as one flag.
  it("separates a key never verified from an agent with no key at all", () => {
    expect(describePinning(credential({ keySource: "response" })).status).toBe("unverified");
    expect(describePinning(credential({ publicKeyPin: "", keySource: "none" })).status).toBe(
      "not-applicable"
    );
  });

  it("treats a key taken from the response as unverified", () => {
    expect(describePinning(credential({ keySource: "response" })).status).toBe("unverified");
  });

  it("says so when the build cannot enforce a pin at all", () => {
    mockNative.isSupported = false;
    expect(describePinning(credential({ keySource: "qr" })).status).toBe("unavailable");
  });

  it("disarms a pin left over when the agent serves no TLS", () => {
    describePinning(credential({ publicKeyPin: "" }));
    expect(mockSetPin).toHaveBeenCalledWith(null);
  });

  it("holds no key for a device that has not paired", () => {
    expect(describePinning(null).status).toBe("not-applicable");
  });
});

describe("a credential stored before keySource existed", () => {
  // Every such pairing went over the cleartext bootstrap listener and took the
  // key out of the response, so that is what they are — not a guess.
  it("is read as a key taken from the response", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({
        host: "192.168.1.5",
        agentPort: 9470,
        deviceID: "device-1",
        deviceToken: "token",
        publicKeyPin: "sha256/aaa",
      })
    );

    await expect(loadCredential()).resolves.toMatchObject({ keySource: "response" });
  });

  it("is read as having no key when the agent served no TLS", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({
        host: "192.168.1.5",
        agentPort: 9470,
        deviceID: "device-1",
        deviceToken: "token",
        publicKeyPin: "",
      })
    );

    await expect(loadCredential()).resolves.toMatchObject({ keySource: "none" });
  });

  it("keeps a keySource that was already stored", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({
        host: "192.168.1.5",
        agentPort: 9470,
        deviceID: "device-1",
        deviceToken: "token",
        publicKeyPin: "sha256/aaa",
        keySource: "qr",
      })
    );

    await expect(loadCredential()).resolves.toMatchObject({ keySource: "qr" });
  });
});
