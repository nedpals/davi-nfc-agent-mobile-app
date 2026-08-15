import { getDeviceCapabilities } from "@/constants/config";

export interface CapabilityRow {
  label: string;
  value: string;
  offered: boolean;
}

/**
 * What this device tells the agent it can do, in the words a person would use.
 *
 * Read from the same declaration the agent is sent, so the screen cannot drift
 * from the promise — a device that says it can write here is one the agent will
 * route writes to.
 */
export function describeCapabilities(): CapabilityRow[] {
  const capabilities = getDeviceCapabilities();
  const yesNo = (offered: boolean, label: string): CapabilityRow => ({
    label,
    value: offered ? "Yes" : "No",
    offered,
  });

  return [
    yesNo(capabilities.canRead, "Reads tags"),
    yesNo(capabilities.canWrite, "Writes tags"),
    yesNo(capabilities.canTransceive === true, "Raw exchange"),
    yesNo(capabilities.canLock === true, "Locks tags"),
    {
      label: "Tag hold",
      // An absent limit means the tag is available for as long as it is held,
      // which is what a reader with the tag in its field can offer.
      value: capabilities.maxHoldMs
        ? `About ${Math.round(capabilities.maxHoldMs / 1000)} seconds`
        : "While it stays in the field",
      offered: true,
    },
    {
      label: "Tag types",
      value: capabilities.supportedTagTypes.join(", "),
      offered: true,
    },
  ];
}
