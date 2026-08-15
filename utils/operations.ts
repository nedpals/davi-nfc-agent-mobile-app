import type { TagOperation } from "@/types/protocol";

// Failures the person holding the phone can actually do something about: the
// tag left the field, or was never there.
const RECOVERABLE_CODES = new Set(["TAG_REMOVED", "TAG_NOT_CONNECTED"]);

export interface OperationCopy {
  message: string;
  chip: string;
  tone: "success" | "warning" | "danger" | "muted";
  // Whether the way out is to present the tag again.
  needsTagAgain: boolean;
}

/**
 * What to say about work the agent is doing on the tag.
 *
 * While it runs the message is an instruction, because the operation depends
 * on the person keeping the tag still. Afterwards it is an outcome.
 */
export function describeOperation(operation: TagOperation): OperationCopy {
  const writing = operation.kind === "write";

  if (operation.status === "running") {
    return {
      message: writing ? "Writing to the tag — hold it still" : "Reading the tag — hold it still",
      chip: "Working",
      tone: "muted",
      needsTagAgain: false,
    };
  }

  if (operation.status === "succeeded") {
    return {
      message: writing ? "The agent wrote this tag" : "The agent finished with this tag",
      chip: writing ? "Written" : "Done",
      tone: "success",
      needsTagAgain: false,
    };
  }

  const needsTagAgain = RECOVERABLE_CODES.has(operation.errorCode ?? "");

  return {
    message: needsTagAgain
      ? "Present the tag again to finish"
      : (operation.error ?? "The operation failed"),
    chip: "Failed",
    tone: needsTagAgain ? "warning" : "danger",
    needsTagAgain,
  };
}

// How long an outcome stays on screen. A failure is left longer because it asks
// something of the person, where a success only reports.
export const OPERATION_SUCCESS_LINGER = 2500;
export const OPERATION_FAILURE_LINGER = 6000;
