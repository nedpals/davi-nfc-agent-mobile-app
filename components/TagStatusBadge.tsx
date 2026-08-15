import { Chip } from "./Chip";

interface TagStatusBadgeProps {
  // Whether the agent has the scan, as opposed to this device alone.
  sent: boolean;
}

export function TagStatusBadge({ sent }: TagStatusBadgeProps) {
  return <Chip label={sent ? "Sent" : "Local"} tone={sent ? "success" : "warning"} />;
}
