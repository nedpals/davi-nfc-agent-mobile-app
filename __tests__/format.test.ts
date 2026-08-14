import { formatDateTime, formatTimeAgo, toDate, truncateMiddle } from "@/utils/format";

describe("formatTimeAgo", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it.each([
    [new Date("2026-01-01T11:59:55Z"), "Just now"],
    [new Date("2026-01-01T11:59:30Z"), "30s ago"],
    [new Date("2026-01-01T11:45:00Z"), "15m ago"],
    [new Date("2026-01-01T09:00:00Z"), "3h ago"],
    [new Date("2025-12-30T12:00:00Z"), "2d ago"],
  ])("describes %s as %s", (value, expected) => {
    expect(formatTimeAgo(value, now)).toBe(expected);
  });

  it("does not report a clock skew as a time in the future", () => {
    expect(formatTimeAgo(new Date("2026-01-01T12:00:30Z"), now)).toBe("Just now");
  });

  it("falls back to a date once a week has passed", () => {
    expect(formatTimeAgo(new Date("2025-11-01T12:00:00Z"), now)).toBe(
      new Date("2025-11-01T12:00:00Z").toLocaleDateString()
    );
  });

  it("accepts the string a persisted date comes back as", () => {
    expect(formatTimeAgo("2026-01-01T11:45:00Z", now)).toBe("15m ago");
  });

  it("reports an unparseable value rather than throwing", () => {
    expect(formatTimeAgo("not a date", now)).toBe("Unknown");
  });
});

describe("formatDateTime", () => {
  it("names the absence of a date", () => {
    expect(formatDateTime(null)).toBe("Never");
    expect(formatDateTime(undefined)).toBe("Never");
  });
});

describe("toDate", () => {
  it("rejects invalid dates instead of passing them on", () => {
    expect(toDate(new Date("nonsense"))).toBeNull();
    expect(toDate("nonsense")).toBeNull();
  });
});

describe("truncateMiddle", () => {
  it("leaves short values alone", () => {
    expect(truncateMiddle("abcdef")).toBe("abcdef");
  });

  it("keeps both ends of a long value", () => {
    expect(truncateMiddle("0123456789abcdefghij", 4)).toBe("0123…ghij");
  });
});
