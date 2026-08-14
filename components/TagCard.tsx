import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";
import { formatTimeAgo } from "@/utils/format";
import type { ScannedTag } from "@/types/protocol";

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
        <View style={[styles.badge, tag.sentToServer ? styles.badgeSent : styles.badgeLocal]}>
          <Text
            style={[
              styles.badgeText,
              tag.sentToServer ? styles.badgeTextSent : styles.badgeTextLocal,
            ]}
          >
            {tag.sentToServer ? "Sent" : "Local"}
          </Text>
        </View>
      </View>

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
                <Text style={styles.recordRaw}>
                  {record.recordType ?? `TNF ${record.tnf}`} · {record.payload.length} bytes encoded
                </Text>
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
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  badgeSent: {
    backgroundColor: colors.successSoft,
  },
  badgeLocal: {
    backgroundColor: colors.warningSoft,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextSent: {
    color: colors.successText,
  },
  badgeTextLocal: {
    color: colors.warningText,
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
