import { Platform } from "react-native";
import { IOS_TAG_HOLD_MS, getDeviceCapabilities } from "@/constants/config";
import { describeCapabilities } from "@/utils/capabilities";

const originalOS = Platform.OS;
const setPlatform = (os: "ios" | "android") =>
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });

afterAll(() => setPlatform(originalOS as "ios" | "android"));

describe("declared capabilities", () => {
  it("offers writing, locking and transceive on Android", () => {
    setPlatform("android");
    const caps = getDeviceCapabilities();

    expect(caps).toMatchObject({
      canRead: true,
      canWrite: true,
      canLock: true,
      canTransceive: true,
      canTransceiveRaw: true,
      nfcType: "isodep",
    });
  });

  it("withholds them on iOS rather than letting the agent route work here", () => {
    setPlatform("ios");
    const caps = getDeviceCapabilities();

    expect(caps).toMatchObject({
      canRead: true,
      canWrite: false,
      canLock: false,
      canTransceive: false,
      canTransceiveRaw: false,
      nfcType: "corenfc",
    });
  });

  it("declares no hold bound on Android, where a tag stays until it leaves", () => {
    setPlatform("android");

    // Absent rather than zero: the agent reads a missing field as open-ended,
    // and sending anything makes the payload differ from a v0 device's.
    expect(getDeviceCapabilities()).not.toHaveProperty("maxHoldMs");
  });

  it("declares CoreNFC's hold bound on iOS", () => {
    setPlatform("ios");

    expect(getDeviceCapabilities().maxHoldMs).toBe(IOS_TAG_HOLD_MS);
    // Under Apple's ~20s limit, so the agent's margin is not the only one.
    expect(IOS_TAG_HOLD_MS).toBeLessThan(20_000);
  });

  it("only claims MIFARE Classic where the platform can reach it", () => {
    setPlatform("android");
    expect(getDeviceCapabilities().supportedTagTypes).toContain("MIFARE Classic");

    setPlatform("ios");
    expect(getDeviceCapabilities().supportedTagTypes).not.toContain("MIFARE Classic");
  });
});

// What Settings shows has to be the same promise the agent is given, or the
// screen becomes a second, drifting source of truth.
describe("describeCapabilities", () => {
  const rowFor = (label: string) => describeCapabilities().find((row) => row.label === label);

  it("reports what Android offers", () => {
    setPlatform("android");

    expect(rowFor("Writes tags")).toMatchObject({ value: "Yes", offered: true });
    expect(rowFor("Raw exchange")).toMatchObject({ value: "Yes" });
    expect(rowFor("Tag hold")?.value).toBe("While it stays in the field");
  });

  it("reports what iOS withholds, and for how long it can hold a tag", () => {
    setPlatform("ios");

    expect(rowFor("Writes tags")).toMatchObject({ value: "No", offered: false });
    expect(rowFor("Locks tags")).toMatchObject({ value: "No" });
    expect(rowFor("Tag hold")?.value).toBe(`About ${Math.round(IOS_TAG_HOLD_MS / 1000)} seconds`);
  });

  it("lists the tag types the platform can actually reach", () => {
    setPlatform("ios");
    expect(rowFor("Tag types")?.value).not.toContain("MIFARE Classic");

    setPlatform("android");
    expect(rowFor("Tag types")?.value).toContain("MIFARE Classic");
  });
});
