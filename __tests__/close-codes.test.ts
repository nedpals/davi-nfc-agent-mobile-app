import {
  CLOSE_CODE,
  describeCloseCode,
  isTerminalCloseCode,
} from "@/services/connection-errors";

describe("describeCloseCode", () => {
  // Agent 1.2.0 ends the session of a device whose credential was revoked,
  // which used to leave the device reconnecting into a refusal forever.
  it("explains a revoked credential", () => {
    expect(describeCloseCode(CLOSE_CODE.policyViolation, "")).toMatch(/revoked/i);
  });

  it("explains a frame the agent judged too large", () => {
    expect(describeCloseCode(CLOSE_CODE.messageTooBig, "")).toMatch(/too large/i);
  });

  it("falls through to the reason for an ordinary close", () => {
    expect(describeCloseCode(CLOSE_CODE.goingAway, "connection refused")).toMatch(
      /Nothing answered/
    );
  });

  it("still says something when there is no reason at all", () => {
    expect(describeCloseCode(undefined, undefined)).toBe("The agent did not answer.");
  });
});

describe("isTerminalCloseCode", () => {
  it("does not retry a revoked credential", () => {
    expect(isTerminalCloseCode(CLOSE_CODE.policyViolation)).toBe(true);
  });

  it("retries an ordinary drop", () => {
    expect(isTerminalCloseCode(CLOSE_CODE.goingAway)).toBe(false);
    expect(isTerminalCloseCode(undefined)).toBe(false);
  });
});
