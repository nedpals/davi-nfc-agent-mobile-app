export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimeAgo(value: Date | string | number, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) {
    return "Unknown";
  }

  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 0) {
    return "Just now";
  }
  if (seconds < 10) {
    return "Just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString();
}

export function formatDateTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleString() : "Never";
}

export function formatClockTime(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * How many bytes a base64 string stands for. Its own length is four characters
 * per three bytes, so reporting that as a byte count overstates it by a third.
 */
export function base64ByteLength(value: string): number {
  if (!value) {
    return 0;
  }

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

/**
 * Shorten a long opaque value so it can be shown without wrapping over several
 * lines. Identifiers and key pins are recognised by their ends, not the middle.
 */
export function truncateMiddle(value: string, keep = 8): string {
  if (value.length <= keep * 2 + 1) {
    return value;
  }
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}
