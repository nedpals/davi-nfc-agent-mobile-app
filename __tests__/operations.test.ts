import { describeOperation } from "@/utils/operations";
import type { TagOperation } from "@/types/protocol";

const operation = (overrides: Partial<TagOperation> = {}): TagOperation => ({
  kind: "write",
  tagUID: "04:A2",
  status: "running",
  startedAt: new Date(),
  ...overrides,
});

describe("describeOperation", () => {
  it("asks the person to hold still while a write runs", () => {
    expect(describeOperation(operation())).toMatchObject({
      message: "Writing to the tag — hold it still",
      chip: "Working",
      needsTagAgain: false,
    });
  });

  it("says which way the exchange goes while transceiving", () => {
    expect(describeOperation(operation({ kind: "transceive" })).message).toBe(
      "Reading the tag — hold it still"
    );
  });

  it("reports a completed write as an outcome, not an instruction", () => {
    expect(describeOperation(operation({ status: "succeeded" }))).toMatchObject({
      message: "The agent wrote this tag",
      chip: "Written",
      tone: "success",
    });
  });

  it("asks for the tag again when it was taken away mid-operation", () => {
    const copy = describeOperation(
      operation({ status: "failed", errorCode: "TAG_REMOVED", error: "Tag 04:A2 is no longer present" })
    );

    expect(copy).toMatchObject({
      message: "Present the tag again to finish",
      chip: "Failed",
      tone: "warning",
      needsTagAgain: true,
    });
  });

  it("asks for a tag when the agent wanted one and none was there", () => {
    expect(
      describeOperation(
        operation({ status: "failed", tagUID: null, errorCode: "TAG_NOT_CONNECTED" })
      ).needsTagAgain
    ).toBe(true);
  });

  it("shows the agent's own reason when the person cannot fix it", () => {
    const copy = describeOperation(
      operation({ status: "failed", errorCode: "READ_ONLY", error: "The tag is read-only" })
    );

    expect(copy).toMatchObject({
      message: "The tag is read-only",
      tone: "danger",
      needsTagAgain: false,
    });
  });

  it("still says something when a failure carries no reason", () => {
    expect(describeOperation(operation({ status: "failed" })).message).toBe(
      "The operation failed"
    );
  });
});
