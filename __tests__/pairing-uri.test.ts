import { isPairingUri, parsePairingUri, PairingUriError } from "@/services/pairing-uri";

const SPKI = "sha256/47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

describe("parsePairingUri", () => {
  it("reads the invitation the agent prints", () => {
    const invitation = parsePairingUri(
      `davi-pair://192.168.1.5:9470/?spki=${encodeURIComponent(SPKI)}&code=123456&name=Davi%20NFC%20Agent`
    );

    expect(invitation).toEqual({
      host: "192.168.1.5",
      port: 9470,
      spki: SPKI,
      code: "123456",
      name: "Davi NFC Agent",
    });
  });

  it("falls back to the port the agent serves devices on", () => {
    expect(parsePairingUri(`davi-pair://kiosk.local/?spki=${encodeURIComponent(SPKI)}`).port).toBe(
      9470
    );
  });

  it("keeps an IPv6 literal intact", () => {
    const invitation = parsePairingUri(
      `davi-pair://[fe80::1]:9470/?spki=${encodeURIComponent(SPKI)}`
    );
    expect(invitation.host).toBe("fe80::1");
    expect(invitation.port).toBe(9470);
  });

  it("decodes a name written with + for spaces", () => {
    const invitation = parsePairingUri(
      `davi-pair://kiosk.local/?spki=${encodeURIComponent(SPKI)}&name=Front+Desk`
    );
    expect(invitation.name).toBe("Front Desk");
  });

  it("omits a code the QR did not carry", () => {
    expect(
      parsePairingUri(`davi-pair://kiosk.local/?spki=${encodeURIComponent(SPKI)}`).code
    ).toBeUndefined();
  });

  // The pin is the only thing the QR carries that the network cannot supply
  // safely. An invitation without one would pair as if it had been verified.
  it("refuses an invitation carrying no key pin", () => {
    expect(() => parsePairingUri("davi-pair://kiosk.local/?code=123456")).toThrow(PairingUriError);
  });

  it("refuses a key pin in a form it cannot check", () => {
    expect(() => parsePairingUri("davi-pair://kiosk.local/?spki=deadbeef")).toThrow(PairingUriError);
  });

  it("refuses an invitation naming no address", () => {
    expect(() => parsePairingUri(`davi-pair:///?spki=${encodeURIComponent(SPKI)}`)).toThrow(
      PairingUriError
    );
  });

  it("refuses anything that is not a pairing link", () => {
    expect(() => parsePairingUri("https://kiosk.local/pair")).toThrow(PairingUriError);
  });
});

describe("isPairingUri", () => {
  it.each([
    ["davi-pair://kiosk.local/?spki=x", true],
    ["DAVI-PAIR://kiosk.local/", true],
    ["  davi-pair://kiosk.local/  ", true],
    ["https://kiosk.local/", false],
    ["", false],
  ])("%s -> %s", (input, expected) => {
    expect(isPairingUri(input)).toBe(expected);
  });
});
