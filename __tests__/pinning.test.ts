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
    ...overrides,
  };
}

describe("describePinning", () => {
  beforeEach(() => {
    mockSetPin.mockClear();
    mockNative.isSupported = true;
  });

  it("reports a pairing made from the agent's QR as enforced", () => {
    expect(describePinning(credential({ pinVerified: true }))).toEqual({
      status: "pinned",
      pin: "sha256/aaa",
    });
  });

  // The distinction this exists for: a key nothing checked is not the same
  // answer as no key to check, and both used to read as one flag.
  it("separates a key never verified from an agent with no key at all", () => {
    expect(describePinning(credential({ pinVerified: false })).status).toBe("unverified");
    expect(describePinning(credential({ publicKeyPin: "", pinVerified: false })).status).toBe(
      "not-applicable"
    );
  });

  // Credentials stored before the field existed were paired the unpinned way,
  // which is exactly what the absent value should be read as.
  it("treats a credential predating the field as unverified", () => {
    expect(describePinning(credential()).status).toBe("unverified");
  });

  it("says so when the build cannot enforce a pin at all", () => {
    mockNative.isSupported = false;
    expect(describePinning(credential({ pinVerified: true })).status).toBe("unavailable");
  });

  it("disarms a pin left over when the agent serves no TLS", () => {
    describePinning(credential({ publicKeyPin: "" }));
    expect(mockSetPin).toHaveBeenCalledWith(null);
  });

  it("holds no key for a device that has not paired", () => {
    expect(describePinning(null).status).toBe("not-applicable");
  });
});
