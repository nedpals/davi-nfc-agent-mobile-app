import { StyleSheet, Text, View } from "react-native";
import { Chip } from "./Chip";
import { TagStatusBadge } from "./TagStatusBadge";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";
import { base64ByteLength, formatTimeAgo } from "@/utils/format";
import type { NDEFRecord, ScannedTag, TagOperationRecord } from "@/types/protocol";

function describeOperationRecord(entry: TagOperationRecord): string {
  const verb = entry.kind === "write" ? "Written" : "Exchange";
  return entry.succeeded ? verb : `${verb} failed`;
}

function describeRecord(record: NDEFRecord): string {
  const kind = record.recordType ?? `TNF ${record.tnf}`;
  const bytes = base64ByteLength(record.payload);

  return bytes ? `${kind} · ${bytes} bytes, not text` : `${kind} · empty`;
}

interface TagCardProps {
  tag: ScannedTag;
}

export function TagCard({ tag }: TagCardProps) {
  const records = tag.ndefMessage?.records ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.uid} numberOfLines={1}>
          {tag.uid}
        </Text>
        <TagStatusBadge sent={tag.sentToServer} />
      </View>

      {tag.operations?.length ? (
        <View style={styles.operations}>
          {tag.operations.map((entry, index) => (
            <Chip
              key={index}
              label={describeOperationRecord(entry)}
              tone={entry.succeeded ? "success" : "danger"}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.meta}>
        <Text style={styles.metaText}>{tag.type}</Text>
        <Text style={styles.separator}>·</Text>
        <Text style={styles.metaText}>{tag.technology}</Text>
        <Text style={styles.separator}>·</Text>
        <Text style={styles.metaText}>{formatTimeAgo(tag.scannedAt)}</Text>
      </View>

      {records.length > 0 && (
        <View style={styles.ndef}>
          {records.map((record, index) => (
            <View key={index} style={styles.record}>
              {record.content ? (
                <Text style={styles.recordContent} numberOfLines={3}>
                  {record.content}
                </Text>
              ) : (
                <Text style={styles.recordRaw}>{describeRecord(record)}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  uid: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.brand,
    fontFamily: fontFamily.mono,
  },
  operations: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  separator: {
    ...typography.caption,
    color: colors.disabled,
  },
  ndef: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  record: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  recordContent: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
  },
  recordRaw: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: fontFamily.mono,
  },
});
