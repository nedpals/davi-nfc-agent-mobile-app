import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Chip } from "./Chip";
import { TagStatusBadge } from "./TagStatusBadge";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";
import { base64ByteLength, formatDateTime, formatTimeAgo } from "@/utils/format";
import type { NDEFRecord, ScannedTag, TagOperationRecord } from "@/types/protocol";

interface TagCardProps {
  tag: ScannedTag;
  expanded?: boolean;
  onToggle?: () => void;
}

function describeRecord(record: NDEFRecord): string {
  const kind = record.recordType ?? `TNF ${record.tnf}`;
  const bytes = base64ByteLength(record.payload);

  return bytes ? `${kind} · ${bytes} bytes, not text` : `${kind} · empty`;
}

function describeOperationRecord(entry: TagOperationRecord): string {
  const verb = entry.kind === "write" ? "Written" : "Exchange";
  return entry.succeeded ? verb : `${verb} failed`;
}

export function TagCard({ tag, expanded, onToggle }: TagCardProps) {
  const records = tag.ndefMessage?.records ?? [];
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    []
  );

  // A UID is what gets pasted into whatever the tag is being registered with,
  // and retyping colon-separated hex by hand is its own kind of error.
  const copyUid = useCallback(async () => {
    await Clipboard.setStringAsync(tag.uid);
    Haptics.selectionAsync().catch(() => {});

    setCopied(true);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [tag.uid]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onToggle}
      disabled={!onToggle}
      activeOpacity={0.85}
      accessibilityRole={onToggle ? "button" : undefined}
      accessibilityLabel={`Tag ${tag.uid}`}
      accessibilityState={{ expanded: !!expanded }}
    >
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

      {!expanded && records.length > 0 && (
        <Text style={styles.hint}>
          {records.length === 1 ? "1 NDEF record" : `${records.length} NDEF records`}
        </Text>
      )}

      {expanded && (
        <View style={styles.detail}>
          <Text style={styles.detailTime}>{formatDateTime(tag.scannedAt)}</Text>

          {records.map((record, index) => (
            <View key={index} style={styles.record}>
              {record.content ? (
                <Text style={styles.recordContent}>{record.content}</Text>
              ) : (
                <Text style={styles.recordRaw}>{describeRecord(record)}</Text>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={styles.copy}
            onPress={copyUid}
            accessibilityRole="button"
            accessibilityLabel={`Copy UID ${tag.uid}`}
            hitSlop={8}
          >
            <Text style={styles.copyLabel}>{copied ? "Copied" : "Copy UID"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
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
  hint: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: spacing.sm,
  },
  detail: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  detailTime: {
    ...typography.caption,
    color: colors.textMuted,
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
  copy: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  copyLabel: {
    ...typography.label,
    color: colors.link,
    fontWeight: "700",
  },
});
